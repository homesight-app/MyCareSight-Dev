-- Read-only verification for migration 040. Expect every value to be true and pending_skill_count to be zero.
WITH skill_write_policies AS (
  SELECT policyname, cmd, lower(COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) AS definition
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'caregiver_skill_assignments'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
), credential_policies AS (
  SELECT policyname, cmd, lower(COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) AS definition
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'caregiver_credentials'
)
SELECT
  (SELECT count(*) FROM public.caregiver_skill_assignments WHERE verification_status = 'self_reported')
    AS pending_skill_count,
  (SELECT count(*) = 3 AND bool_and(policyname LIKE '%manager%') FROM skill_write_policies)
    AS skill_writes_are_manager_only,
  NOT EXISTS (
    SELECT 1 FROM skill_write_policies
    WHERE definition LIKE '%skill_actor_is_caregiver%'
  ) AS caregiver_has_no_skill_write_policy,
  (
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.caregiver_credentials'::regclass
  ) AS credential_rls_forced,
  (SELECT count(*) = 4 FROM credential_policies) AS credential_policy_count_ok,
  EXISTS (
    SELECT 1 FROM credential_policies
    WHERE cmd = 'SELECT' AND definition LIKE '%skill_actor_is_caregiver%'
  ) AS caregiver_can_read_own_credentials,
  NOT EXISTS (
    SELECT 1 FROM credential_policies
    WHERE cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND definition LIKE '%skill_actor_is_caregiver%'
  ) AS caregiver_has_no_credential_write_policy,
  NOT has_table_privilege('public', 'public.caregiver_credentials', 'SELECT')
    AND NOT has_table_privilege('public', 'public.caregiver_credentials', 'INSERT')
    AND NOT has_table_privilege('public', 'public.caregiver_credentials', 'UPDATE')
    AND NOT has_table_privilege('public', 'public.caregiver_credentials', 'DELETE')
    AS public_has_no_credential_access,
  has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'SELECT')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'INSERT')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'UPDATE')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'DELETE')
    AS runtime_has_policy_gated_credential_grants;

