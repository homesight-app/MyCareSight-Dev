-- Prevent non-authorization personnel edits from manufacturing a membership
-- update and revoking an otherwise valid Auth.js session. The future migration
-- runner owns the surrounding transaction and ledger write.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preconditions$
BEGIN
  IF to_regprocedure('public.sync_user_agency_role()') IS NULL
     OR to_regprocedure('public.revoke_auth_sessions_after_identity_change()') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.auth_sessions') IS NULL THEN
    RAISE EXCEPTION '039 precondition failed: migrations 015 and 019 must be applied first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.user_agency_roles'::regclass
      AND tgname = 'user_agency_roles_revoke_auth_sessions'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '039 precondition failed: membership session-revocation trigger is missing';
  END IF;
END
$preconditions$;

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
  DO UPDATE SET status = EXCLUDED.status, updated_at = now()
  WHERE user_agency_roles.status IS DISTINCT FROM EXCLUDED.status;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.revoke_auth_sessions_after_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  target_user_id uuid;
  prior_user_id uuid;
  reason text;
  actor_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'user_profiles' THEN
    target_user_id := NEW.id;
    IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.role IS NOT DISTINCT FROM OLD.role
       AND NEW.agency_id IS NOT DISTINCT FROM OLD.agency_id
       AND NEW.email IS NOT DISTINCT FROM OLD.email
       AND NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash THEN
      RETURN NEW;
    END IF;
    reason := 'identity_changed';
  ELSE
    IF TG_OP = 'UPDATE'
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.agency_id IS NOT DISTINCT FROM OLD.agency_id
       AND NEW.role IS NOT DISTINCT FROM OLD.role
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
      target_user_id := OLD.user_id;
      prior_user_id := OLD.user_id;
    ELSIF TG_OP = 'INSERT' THEN
      target_user_id := NEW.user_id;
      prior_user_id := NEW.user_id;
    ELSE
      target_user_id := NEW.user_id;
      prior_user_id := OLD.user_id;
    END IF;
    reason := 'membership_changed';
  END IF;

  UPDATE public.auth_sessions
  SET revoked_at = COALESCE(revoked_at, now()),
      revoke_reason = COALESCE(revoke_reason, reason)
  WHERE user_id IN (target_user_id, COALESCE(prior_user_id, target_user_id))
    AND revoked_at IS NULL;

  actor_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  INSERT INTO public.audit_log (
    table_name, record_id, action, performed_by_user_id, details
  ) VALUES (
    'auth_sessions', target_user_id, 'REVOKE', actor_id,
    jsonb_build_object('reason', reason)
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS agency_admins_sync_role ON public.agency_admins;
CREATE TRIGGER agency_admins_sync_role
  AFTER INSERT OR DELETE OR UPDATE OF user_id, agency_id, status
  ON public.agency_admins
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

DROP TRIGGER IF EXISTS care_coordinators_sync_role ON public.care_coordinators;
CREATE TRIGGER care_coordinators_sync_role
  AFTER INSERT OR DELETE OR UPDATE OF user_id, agency_id, status
  ON public.care_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

DROP TRIGGER IF EXISTS caregiver_members_sync_role ON public.caregiver_members;
CREATE TRIGGER caregiver_members_sync_role
  AFTER INSERT OR DELETE OR UPDATE OF user_id, agency_id, status
  ON public.caregiver_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

DROP TRIGGER IF EXISTS user_agency_roles_revoke_auth_sessions ON public.user_agency_roles;
CREATE TRIGGER user_agency_roles_revoke_auth_sessions
  AFTER INSERT OR DELETE OR UPDATE OF user_id, agency_id, role, status
  ON public.user_agency_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_auth_sessions_after_identity_change();

