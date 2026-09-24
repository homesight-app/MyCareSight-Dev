-- Read-only verification for 013. Expect one row with access_pass=true.
WITH state AS (
  SELECT
    c.relrowsecurity AND c.relforcerowsecurity AS forced_rls,
    (SELECT array_agg(policyname ORDER BY policyname) FROM pg_policies
      WHERE schemaname='public' AND tablename='patient_service_contracts') = ARRAY[
        'patient_service_contracts_manager_delete','patient_service_contracts_manager_insert',
        'patient_service_contracts_manager_select','patient_service_contracts_manager_update']::name[] AS exact_policies,
    has_table_privilege('mycaresight_app','public.patient_service_contracts','SELECT') AS runtime_select,
    has_table_privilege('mycaresight_app','public.patient_service_contracts','DELETE') AS runtime_delete,
    has_column_privilege('mycaresight_app','public.patient_service_contracts','agency_id','INSERT') AS scoped_insert,
    has_column_privilege('mycaresight_app','public.patient_service_contracts','status','UPDATE') AS lifecycle_update,
    NOT has_column_privilege('mycaresight_app','public.patient_service_contracts','agency_id','UPDATE') AS agency_immutable,
    NOT has_column_privilege('mycaresight_app','public.patient_service_contracts','patient_id','UPDATE') AS patient_immutable,
    to_regclass('public.patient_service_contracts_agency_patient_timeline_idx') IS NOT NULL AS timeline_index
  FROM pg_class c WHERE c.oid='public.patient_service_contracts'::regclass
)
SELECT *,forced_rls AND exact_policies AND runtime_select AND runtime_delete AND scoped_insert
  AND lifecycle_update AND agency_immutable AND patient_immutable AND timeline_index AS access_pass
FROM state;
