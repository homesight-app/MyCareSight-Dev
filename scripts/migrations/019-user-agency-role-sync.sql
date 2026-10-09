-- 019: Restore authoritative agency-membership synchronization in Neon.
-- Apply to Development, verify, then apply to UAT before testing password resets.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE
  duplicate_count integer;
  orphan_count integer;
  invalid_count integer;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '019 must not run against Supabase';
  END IF;
  IF to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.agencies') IS NULL
     OR to_regclass('public.agency_admins') IS NULL
     OR to_regclass('public.care_coordinators') IS NULL
     OR to_regclass('public.caregiver_members') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '019 requires the Neon identity, agency-role, and audit tables';
  END IF;

  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT user_id, agency_id, role
    FROM public.user_agency_roles
    GROUP BY user_id, agency_id, role
    HAVING count(*) > 1
  ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION '019 found % duplicate user_agency_roles keys; reconcile them before retrying', duplicate_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.user_agency_roles membership
  LEFT JOIN public.user_profiles profile ON profile.id = membership.user_id
  LEFT JOIN public.agencies agency ON agency.id = membership.agency_id
  WHERE profile.id IS NULL OR agency.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION '019 found % orphaned user_agency_roles rows; reconcile them before retrying', orphan_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.user_agency_roles
  WHERE role NOT IN ('company_owner', 'care_coordinator', 'staff_member')
     OR status NOT IN ('active', 'inactive', 'invited', 'pending');
  IF invalid_count > 0 THEN
    RAISE EXCEPTION '019 found % user_agency_roles rows with unsupported role/status values', invalid_count;
  END IF;
END
$preflight$;

LOCK TABLE public.user_agency_roles IN SHARE ROW EXCLUSIVE MODE;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_agency_roles'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.user_agency_roles'::regclass AND attname = 'user_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.user_agency_roles'::regclass AND attname = 'agency_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.user_agency_roles'::regclass AND attname = 'role')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.user_agency_roles
      ADD CONSTRAINT user_agency_roles_user_agency_role_key
      UNIQUE (user_id, agency_id, role);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_agency_roles'::regclass
      AND contype = 'f'
      AND conname = 'user_agency_roles_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_agency_roles
      ADD CONSTRAINT user_agency_roles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_agency_roles'::regclass
      AND contype = 'f'
      AND conname = 'user_agency_roles_agency_id_fkey'
  ) THEN
    ALTER TABLE public.user_agency_roles
      ADD CONSTRAINT user_agency_roles_agency_id_fkey
      FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_agency_roles'::regclass
      AND conname = 'user_agency_roles_role_check'
  ) THEN
    ALTER TABLE public.user_agency_roles
      ADD CONSTRAINT user_agency_roles_role_check
      CHECK (role IN ('company_owner', 'care_coordinator', 'staff_member'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_agency_roles'::regclass
      AND conname = 'user_agency_roles_status_check'
  ) THEN
    ALTER TABLE public.user_agency_roles
      ADD CONSTRAINT user_agency_roles_status_check
      CHECK (status IN ('active', 'inactive', 'invited', 'pending'));
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS user_agency_roles_user_id_idx
  ON public.user_agency_roles(user_id);
CREATE INDEX IF NOT EXISTS user_agency_roles_agency_id_idx
  ON public.user_agency_roles(agency_id);

CREATE OR REPLACE FUNCTION public.sync_user_agency_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  expected_role text;
  profile_role text;
  normalized_status text;
  old_source_still_exists boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'agency_admins' THEN
    expected_role := 'company_owner';
  ELSIF TG_TABLE_NAME = 'care_coordinators' THEN
    expected_role := 'care_coordinator';
  ELSIF TG_TABLE_NAME = 'caregiver_members' THEN
    expected_role := 'staff_member';
  ELSE
    RAISE EXCEPTION 'Unsupported agency-role synchronization source: %', TG_TABLE_NAME;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.user_id IS NOT NULL
     AND OLD.agency_id IS NOT NULL
     AND (
       TG_OP = 'DELETE'
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.agency_id IS DISTINCT FROM NEW.agency_id
     ) THEN
    IF TG_TABLE_NAME = 'agency_admins' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.agency_admins source
        WHERE source.id <> OLD.id
          AND source.user_id = OLD.user_id
          AND source.agency_id = OLD.agency_id
      ) INTO old_source_still_exists;
    ELSIF TG_TABLE_NAME = 'care_coordinators' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.care_coordinators source
        WHERE source.id <> OLD.id
          AND source.user_id = OLD.user_id
          AND source.agency_id = OLD.agency_id
      ) INTO old_source_still_exists;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.caregiver_members source
        WHERE source.id <> OLD.id
          AND source.user_id = OLD.user_id
          AND source.agency_id = OLD.agency_id
      ) INTO old_source_still_exists;
    END IF;

    IF NOT old_source_still_exists THEN
      DELETE FROM public.user_agency_roles
      WHERE user_id = OLD.user_id
        AND agency_id = OLD.agency_id
        AND role = expected_role;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.user_id IS NULL OR NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO profile_role
  FROM public.user_profiles
  WHERE id = NEW.user_id;

  -- A stale domain row must not manufacture a permission that conflicts with
  -- the current identity role. Role-change actions update both in one transaction.
  IF profile_role IS DISTINCT FROM expected_role THEN
    DELETE FROM public.user_agency_roles
    WHERE user_id = NEW.user_id
      AND agency_id = NEW.agency_id
      AND role = expected_role;
    RETURN NEW;
  END IF;

  normalized_status := CASE
    WHEN NEW.status IN ('active', 'inactive', 'invited', 'pending') THEN NEW.status
    ELSE 'active'
  END;

  INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
  VALUES (NEW.user_id, NEW.agency_id, expected_role, normalized_status)
  ON CONFLICT (user_id, agency_id, role)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.sync_user_agency_role() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.remove_previous_profile_agency_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.role IN ('company_owner', 'care_coordinator', 'staff_member')
     AND OLD.agency_id IS NOT NULL
     AND (
       OLD.role IS DISTINCT FROM NEW.role
       OR OLD.agency_id IS DISTINCT FROM NEW.agency_id
     ) THEN
    DELETE FROM public.user_agency_roles
    WHERE user_id = OLD.id
      AND agency_id = OLD.agency_id
      AND role = OLD.role;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.remove_previous_profile_agency_role() FROM PUBLIC;

DROP TRIGGER IF EXISTS user_profiles_remove_previous_agency_role ON public.user_profiles;
CREATE TRIGGER user_profiles_remove_previous_agency_role
  AFTER UPDATE OF role, agency_id ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.remove_previous_profile_agency_role();

DROP TRIGGER IF EXISTS agency_admins_sync_role ON public.agency_admins;
CREATE TRIGGER agency_admins_sync_role
  AFTER INSERT OR UPDATE OR DELETE ON public.agency_admins
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

DROP TRIGGER IF EXISTS care_coordinators_sync_role ON public.care_coordinators;
CREATE TRIGGER care_coordinators_sync_role
  AFTER INSERT OR UPDATE OR DELETE ON public.care_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

DROP TRIGGER IF EXISTS caregiver_members_sync_role ON public.caregiver_members;
CREATE TRIGGER caregiver_members_sync_role
  AFTER INSERT OR UPDATE OR DELETE ON public.caregiver_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

WITH expected AS (
  SELECT DISTINCT ON (admin.user_id, admin.agency_id)
    admin.user_id,
    admin.agency_id,
    profile.role,
    CASE
      WHEN admin.status IN ('active', 'inactive', 'invited', 'pending') THEN admin.status
      ELSE 'active'
    END AS status
  FROM public.agency_admins admin
  JOIN public.user_profiles profile
    ON profile.id = admin.user_id
   AND profile.role = 'company_owner'
  WHERE admin.user_id IS NOT NULL AND admin.agency_id IS NOT NULL
  ORDER BY admin.user_id, admin.agency_id,
    CASE admin.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END,
    admin.updated_at DESC
), synchronized AS (
  INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
  SELECT user_id, agency_id, role, status FROM expected
  ON CONFLICT (user_id, agency_id, role)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    WHERE user_agency_roles.status IS DISTINCT FROM EXCLUDED.status
  RETURNING id, agency_id, role, status
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT agency_id, 'user_agency_roles', id, 'SYNC_AGENCY_ROLE', NULL,
  jsonb_build_object('source', 'agency_admins', 'role', role, 'status', status)
FROM synchronized;

WITH expected AS (
  SELECT DISTINCT ON (coordinator.user_id, coordinator.agency_id)
    coordinator.user_id,
    coordinator.agency_id,
    profile.role,
    coordinator.status
  FROM public.care_coordinators coordinator
  JOIN public.user_profiles profile
    ON profile.id = coordinator.user_id
   AND profile.role = 'care_coordinator'
  ORDER BY coordinator.user_id, coordinator.agency_id,
    CASE coordinator.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END,
    coordinator.updated_at DESC
), synchronized AS (
  INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
  SELECT user_id, agency_id, role,
    CASE WHEN status IN ('active', 'inactive', 'invited', 'pending') THEN status ELSE 'active' END
  FROM expected
  ON CONFLICT (user_id, agency_id, role)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    WHERE user_agency_roles.status IS DISTINCT FROM EXCLUDED.status
  RETURNING id, agency_id, role, status
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT agency_id, 'user_agency_roles', id, 'SYNC_AGENCY_ROLE', NULL,
  jsonb_build_object('source', 'care_coordinators', 'role', role, 'status', status)
FROM synchronized;

WITH expected AS (
  SELECT DISTINCT ON (caregiver.user_id, caregiver.agency_id)
    caregiver.user_id,
    caregiver.agency_id,
    profile.role,
    caregiver.status
  FROM public.caregiver_members caregiver
  JOIN public.user_profiles profile
    ON profile.id = caregiver.user_id
   AND profile.role = 'staff_member'
  WHERE caregiver.user_id IS NOT NULL AND caregiver.agency_id IS NOT NULL
  ORDER BY caregiver.user_id, caregiver.agency_id,
    CASE caregiver.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END,
    caregiver.updated_at DESC
), synchronized AS (
  INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
  SELECT user_id, agency_id, role,
    CASE WHEN status IN ('active', 'inactive', 'invited', 'pending') THEN status ELSE 'active' END
  FROM expected
  ON CONFLICT (user_id, agency_id, role)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    WHERE user_agency_roles.status IS DISTINCT FROM EXCLUDED.status
  RETURNING id, agency_id, role, status
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT agency_id, 'user_agency_roles', id, 'SYNC_AGENCY_ROLE', NULL,
  jsonb_build_object('source', 'caregiver_members', 'role', role, 'status', status)
FROM synchronized;

REVOKE ALL ON public.user_agency_roles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.user_agency_roles FROM mycaresight_app;
GRANT SELECT ON public.user_agency_roles TO mycaresight_app;

DO $jobs_access$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON public.user_agency_roles FROM mycaresight_jobs;
  END IF;
END
$jobs_access$;

COMMIT;
