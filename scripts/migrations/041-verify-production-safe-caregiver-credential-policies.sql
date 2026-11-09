-- Read-only verification for migration 041. Expect every value to be true.
WITH skill_policies AS (
  SELECT policyname, cmd, roles,
    lower(COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) AS definition
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'caregiver_skill_assignments'
), credential_policies AS (
  SELECT policyname, cmd, roles,
    lower(COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) AS definition
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'caregiver_credentials'
)
SELECT
  (
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.caregiver_skill_assignments'::regclass
  ) AS skill_rls_forced,
  (
    SELECT count(*) = 4
      AND bool_and(cardinality(roles) = 1 AND 'mycaresight_app' = ANY(roles))
    FROM skill_policies
  ) AS skill_policy_set_is_exact,
  EXISTS (
    SELECT 1 FROM skill_policies
    WHERE policyname = 'caregiver_skill_assignments_select'
      AND cmd = 'SELECT'
      AND definition LIKE '%skill_actor_can_manage_agency%'
      AND definition LIKE '%skill_actor_is_caregiver%'
  ) AS skill_self_read_and_manager_read_exist,
  (
    SELECT count(*) = 3 AND bool_and(policyname LIKE '%manager%')
    FROM skill_policies
    WHERE cmd IN ('INSERT', 'UPDATE', 'DELETE')
  ) AS skill_writes_are_manager_only,
  NOT EXISTS (
    SELECT 1 FROM skill_policies
    WHERE cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND definition LIKE '%skill_actor_is_caregiver%'
  ) AS caregiver_has_no_skill_write_policy,
  EXISTS (
    SELECT 1 FROM skill_policies
    WHERE policyname = 'caregiver_skill_assignments_manager_insert'
      AND definition LIKE '%verification_status%verified%'
      AND definition LIKE '%caregiver_members%'
      AND definition LIKE '%credential_catalog%'
  ) AND EXISTS (
    SELECT 1 FROM skill_policies
    WHERE policyname = 'caregiver_skill_assignments_manager_update'
      AND definition LIKE '%verification_status%verified%'
      AND definition LIKE '%caregiver_members%'
      AND definition LIKE '%credential_catalog%'
  ) AS skill_write_checks_preserve_tenant_and_catalog_integrity,
  (
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.caregiver_credentials'::regclass
  ) AS credential_rls_forced,
  (
    SELECT count(*) = 4
      AND bool_and(cardinality(roles) = 1 AND 'mycaresight_app' = ANY(roles))
    FROM credential_policies
  ) AS credential_policy_set_is_exact,
  EXISTS (
    SELECT 1 FROM credential_policies
    WHERE policyname = 'caregiver_credentials_select'
      AND cmd = 'SELECT'
      AND definition LIKE '%skill_actor_can_manage_agency%'
      AND definition LIKE '%skill_actor_is_caregiver%'
  ) AS credential_self_read_and_manager_read_exist,
  (
    SELECT count(*) = 3 AND bool_and(policyname LIKE '%manager%')
    FROM credential_policies
    WHERE cmd IN ('INSERT', 'UPDATE', 'DELETE')
  ) AS credential_writes_are_manager_only,
  NOT EXISTS (
    SELECT 1 FROM credential_policies
    WHERE cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND definition LIKE '%skill_actor_is_caregiver%'
  ) AS caregiver_has_no_credential_write_policy,
  NOT has_table_privilege('public', 'public.caregiver_skill_assignments', 'SELECT')
    AND NOT has_table_privilege('public', 'public.caregiver_skill_assignments', 'INSERT')
    AND NOT has_table_privilege('public', 'public.caregiver_skill_assignments', 'UPDATE')
    AND NOT has_table_privilege('public', 'public.caregiver_skill_assignments', 'DELETE')
    AND NOT has_table_privilege('public', 'public.caregiver_credentials', 'SELECT')
    AND NOT has_table_privilege('public', 'public.caregiver_credentials', 'INSERT')
    AND NOT has_table_privilege('public', 'public.caregiver_credentials', 'UPDATE')
    AND NOT has_table_privilege('public', 'public.caregiver_credentials', 'DELETE')
    AS public_has_no_caregiver_qualification_access,
  has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'SELECT')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'INSERT')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'UPDATE')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'DELETE')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'SELECT')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'INSERT')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'UPDATE')
    AND has_table_privilege('mycaresight_app', 'public.caregiver_credentials', 'DELETE')
    AS runtime_has_policy_gated_qualification_grants;

