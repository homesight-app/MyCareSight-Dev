-- 021: Remove historical agency-membership drift and strengthen role-change cleanup.
-- Apply after 019 to Development and UAT before relying on account activation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '021 must not run against Supabase';
  END IF;
  IF to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.agency_admins') IS NULL
     OR to_regclass('public.care_coordinators') IS NULL
     OR to_regclass('public.caregiver_members') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '021 requires the Neon identity, agency-role, and audit tables';
  END IF;
  IF to_regprocedure('public.sync_user_agency_role()') IS NULL
     OR to_regprocedure('public.remove_previous_profile_agency_role()') IS NULL THEN
    RAISE EXCEPTION 'Run migration 019 before migration 021';
  END IF;
END
$preflight$;

LOCK TABLE public.user_agency_roles IN SHARE ROW EXCLUSIVE MODE;

-- Materialize the one authoritative role-table row for each agency-scoped
-- profile. Active wins if duplicate source rows exist, followed by pending,
-- invited, and inactive.
CREATE TEMP TABLE migration_021_expected ON COMMIT DROP AS
WITH candidates AS (
  SELECT
    admin.user_id,
    admin.agency_id,
    'company_owner'::text AS role,
    CASE WHEN admin.status IN ('active', 'inactive', 'invited', 'pending')
      THEN admin.status ELSE 'active' END AS status,
    CASE admin.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END AS status_priority,
    admin.updated_at AS source_updated_at,
    admin.id AS source_id
  FROM public.agency_admins admin
  JOIN public.user_profiles profile
    ON profile.id = admin.user_id
   AND profile.role = 'company_owner'
   AND profile.agency_id = admin.agency_id
  WHERE admin.user_id IS NOT NULL AND admin.agency_id IS NOT NULL

  UNION ALL

  SELECT
    coordinator.user_id,
    coordinator.agency_id,
    'care_coordinator'::text,
    CASE WHEN coordinator.status IN ('active', 'inactive', 'invited', 'pending')
      THEN coordinator.status ELSE 'active' END,
    CASE coordinator.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END,
    coordinator.updated_at,
    coordinator.id
  FROM public.care_coordinators coordinator
  JOIN public.user_profiles profile
    ON profile.id = coordinator.user_id
   AND profile.role = 'care_coordinator'
   AND profile.agency_id = coordinator.agency_id

  UNION ALL

  SELECT
    caregiver.user_id,
    caregiver.agency_id,
    'staff_member'::text,
    CASE WHEN caregiver.status IN ('active', 'inactive', 'invited', 'pending')
      THEN caregiver.status ELSE 'active' END,
    CASE caregiver.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END,
    caregiver.updated_at,
    caregiver.id
  FROM public.caregiver_members caregiver
  JOIN public.user_profiles profile
    ON profile.id = caregiver.user_id
   AND profile.role = 'staff_member'
   AND profile.agency_id = caregiver.agency_id
  WHERE caregiver.user_id IS NOT NULL AND caregiver.agency_id IS NOT NULL
)
SELECT DISTINCT ON (user_id, agency_id, role)
  user_id, agency_id, role, status
FROM candidates
ORDER BY user_id, agency_id, role, status_priority, source_updated_at DESC, source_id;

-- Remove historical memberships that no longer match the profile's current
-- role/agency or no longer have a matching domain role record.
WITH removed AS (
  DELETE FROM public.user_agency_roles membership
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_temp.migration_021_expected source
    WHERE source.user_id = membership.user_id
      AND source.agency_id = membership.agency_id
      AND source.role = membership.role
  )
  RETURNING membership.id, membership.agency_id, membership.role, membership.status
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT agency_id, 'user_agency_roles', id, 'REMOVE_STALE_AGENCY_ROLE', NULL,
  jsonb_build_object('role', role, 'status', status, 'source', 'migration_021')
FROM removed;

-- The domain role row remains authoritative for active/pending/inactive state.
WITH synchronized AS (
  INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
  SELECT user_id, agency_id, role, status
  FROM pg_temp.migration_021_expected
  ON CONFLICT (user_id, agency_id, role)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    WHERE user_agency_roles.status IS DISTINCT FROM EXCLUDED.status
  RETURNING id, agency_id, role, status
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT agency_id, 'user_agency_roles', id, 'SYNC_AGENCY_ROLE', NULL,
  jsonb_build_object('role', role, 'status', status, 'source', 'migration_021')
FROM synchronized;

-- Future profile role/agency changes remove every membership that does not
-- match the new identity, including drift that predates migration 019.
CREATE OR REPLACE FUNCTION public.remove_previous_profile_agency_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.agency_id IS DISTINCT FROM NEW.agency_id THEN
    DELETE FROM public.user_agency_roles membership
    WHERE membership.user_id = NEW.id
      AND (
        NEW.role NOT IN ('company_owner', 'care_coordinator', 'staff_member')
        OR NEW.agency_id IS NULL
        OR membership.role IS DISTINCT FROM NEW.role
        OR membership.agency_id IS DISTINCT FROM NEW.agency_id
      );
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.remove_previous_profile_agency_role() FROM PUBLIC;

COMMIT;
