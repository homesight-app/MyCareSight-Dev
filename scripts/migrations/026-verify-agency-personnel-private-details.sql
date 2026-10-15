-- Read-only verification for migration 026.
SET LOCAL search_path = pg_catalog, public;

DO $verify$
BEGIN
  IF to_regclass('public.agency_personnel_private') IS NULL THEN
    RAISE EXCEPTION 'agency_personnel_private is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.agency_personnel_private'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'agency_personnel_private must have forced RLS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agency_personnel_private'::regclass
      AND conname = 'agency_personnel_private_agency_user_key'
  ) THEN
    RAISE EXCEPTION 'agency/person uniqueness constraint is missing';
  END IF;
  IF has_table_privilege('mycaresight_app', 'public.agency_personnel_private', 'DELETE') THEN
    RAISE EXCEPTION 'runtime role must not delete private personnel records';
  END IF;
  IF to_regprocedure('public.protect_personnel_sensitive_fields()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.agency_personnel_private'::regclass
         AND tgname = 'protect_personnel_sensitive_fields_trigger'
         AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'restricted personnel fields must have database enforcement';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agency_personnel_private
    WHERE ssn_encrypted IS NULL AND (ssn_last4 IS NOT NULL OR ssn_key_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'orphan SSN display or key metadata found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agency_key_staff
    WHERE (ssn_encrypted IS NULL) IS DISTINCT FROM (ssn_key_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'agency_key_staff SSN key metadata is inconsistent';
  END IF;
END
$verify$;

SELECT
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE oid = 'public.agency_personnel_private'::regclass;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'agency_personnel_private'
ORDER BY policyname;
