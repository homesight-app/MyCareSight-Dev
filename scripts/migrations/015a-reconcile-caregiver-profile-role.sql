-- 015a: reconcile an unambiguous caregiver profile-role mismatch.
-- Manual Dev first, verify, then unused UAT. Contains no account identifiers.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE candidate_count integer;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '015a must not run against Supabase';
  END IF;
  IF to_regclass('public.auth_sessions') IS NULL
     OR to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.caregiver_members') IS NULL
     OR to_regclass('public.agency_admins') IS NULL THEN
    RAISE EXCEPTION '015a requires migration 015 and the identity/person tables';
  END IF;

  SELECT count(*) INTO candidate_count
  FROM public.user_profiles profile
  WHERE profile.role = 'company_owner'
    AND profile.agency_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_agency_roles membership
      WHERE membership.user_id = profile.id
        AND membership.agency_id = profile.agency_id
        AND membership.role = 'staff_member'
        AND membership.status = 'active'
    )
    AND (
      SELECT count(*) FROM public.user_agency_roles membership
      WHERE membership.user_id = profile.id
        AND membership.agency_id = profile.agency_id
        AND membership.status = 'active'
    ) = 1
    AND EXISTS (
      SELECT 1 FROM public.caregiver_members caregiver
      WHERE caregiver.user_id = profile.id
        AND caregiver.agency_id = profile.agency_id
        AND lower(caregiver.email) = lower(profile.email)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agency_admins admin
      WHERE admin.agency_id = profile.agency_id
        AND (
          admin.user_id = profile.id
          OR admin.company_owner_id = profile.id
          OR lower(admin.contact_email) = lower(profile.email)
        )
    );

  IF candidate_count <> 1 THEN
    RAISE EXCEPTION '015a expected exactly one unambiguous caregiver role mismatch, found %', candidate_count;
  END IF;
END $preflight$;

WITH repaired AS (
  UPDATE public.user_profiles profile
  SET role = 'staff_member', updated_at = now()
  WHERE profile.role = 'company_owner'
    AND profile.agency_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_agency_roles membership
      WHERE membership.user_id = profile.id
        AND membership.agency_id = profile.agency_id
        AND membership.role = 'staff_member'
        AND membership.status = 'active'
    )
    AND (
      SELECT count(*) FROM public.user_agency_roles membership
      WHERE membership.user_id = profile.id
        AND membership.agency_id = profile.agency_id
        AND membership.status = 'active'
    ) = 1
    AND EXISTS (
      SELECT 1 FROM public.caregiver_members caregiver
      WHERE caregiver.user_id = profile.id
        AND caregiver.agency_id = profile.agency_id
        AND lower(caregiver.email) = lower(profile.email)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agency_admins admin
      WHERE admin.agency_id = profile.agency_id
        AND (
          admin.user_id = profile.id
          OR admin.company_owner_id = profile.id
          OR lower(admin.contact_email) = lower(profile.email)
        )
    )
  RETURNING id, agency_id
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT
  repaired.agency_id,
  'user_profiles',
  repaired.id,
  'RECONCILE_ROLE',
  NULL,
  jsonb_build_object(
    'old_role', 'company_owner',
    'new_role', 'staff_member',
    'reason', 'active_membership_and_caregiver_record'
  )
FROM repaired;

COMMIT;
