-- Read-only verification for migration 043. Expect every value to be true.
WITH policies AS (
  SELECT policyname, cmd, roles,
    lower(COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) AS definition
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'lead_documents'
)
SELECT
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'leads'
      AND indexname = 'idx_leads_converted_client_id'
      AND indexdef LIKE '%converted_client_id%'
  ) AS converted_client_lookup_index_exists,
  (
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.lead_documents'::regclass
  ) AS lead_document_rls_forced,
  (
    SELECT count(*) = 3
      AND bool_and(cardinality(roles) = 1 AND 'mycaresight_app' = ANY(roles))
      AND bool_and(cmd IN ('SELECT', 'INSERT', 'DELETE'))
    FROM policies
  ) AS policy_set_is_exact,
  (
    SELECT bool_and(
      definition LIKE '%leads%'
      AND definition LIKE '%plan_actor_is_platform_staff%'
      AND definition LIKE '%skill_actor_can_manage_agency%'
    )
    FROM policies
  ) AS policies_are_tenant_scoped,
  NOT has_table_privilege('public', 'public.lead_documents', 'SELECT')
    AND NOT has_table_privilege('public', 'public.lead_documents', 'INSERT')
    AND NOT has_table_privilege('public', 'public.lead_documents', 'UPDATE')
    AND NOT has_table_privilege('public', 'public.lead_documents', 'DELETE')
    AS public_has_no_access,
  has_table_privilege('mycaresight_app', 'public.lead_documents', 'SELECT')
    AND has_table_privilege('mycaresight_app', 'public.lead_documents', 'INSERT')
    AND NOT has_table_privilege('mycaresight_app', 'public.lead_documents', 'UPDATE')
    AND has_table_privilege('mycaresight_app', 'public.lead_documents', 'DELETE')
    AS runtime_grants_are_least_privilege;
