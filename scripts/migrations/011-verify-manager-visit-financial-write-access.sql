-- Read-only verification for 011. Expect four rows with write_access_pass=true.
WITH expected(table_name,insert_policy,update_policy) AS (VALUES
 ('visit_time_entries','visit_time_entries_manager_insert','visit_time_entries_manager_update'),
 ('visit_approvals','visit_approvals_manager_insert','visit_approvals_manager_update'),
 ('visit_financials','visit_financials_manager_insert','visit_financials_manager_update'),
 ('visit_adjustment_history','visit_adjustment_history_manager_insert',NULL::text)
), state AS (
 SELECT expected.*,
   (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('public.'||table_name)::regclass) forced_rls,
   EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=table_name
     AND policyname=insert_policy AND cmd='INSERT' AND roles=ARRAY['mycaresight_app']::name[]) insert_policy_ok,
   (update_policy IS NULL OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=table_name
     AND policyname=update_policy AND cmd='UPDATE' AND roles=ARRAY['mycaresight_app']::name[])) update_policy_ok,
   (update_policy IS NULL OR table_name='visit_time_entries' OR EXISTS(SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename=table_name AND policyname=update_policy
       AND position('visit_time_entries' in coalesce(qual,''))>0)) old_row_linked,
   has_column_privilege('mycaresight_app','public.'||table_name,'agency_id','INSERT') insert_grant,
   CASE WHEN update_policy IS NULL THEN NOT has_table_privilege('mycaresight_app','public.'||table_name,'UPDATE')
     ELSE has_column_privilege('mycaresight_app','public.'||table_name,'updated_at','UPDATE') END update_grant,
   NOT has_table_privilege('mycaresight_app','public.'||table_name,'DELETE') delete_denied,
   CASE table_name
     WHEN 'visit_time_entries' THEN NOT has_column_privilege('mycaresight_app','public.visit_time_entries','agency_id','UPDATE')
     WHEN 'visit_approvals' THEN NOT has_column_privilege('mycaresight_app','public.visit_approvals','agency_id','UPDATE')
     WHEN 'visit_financials' THEN NOT has_column_privilege('mycaresight_app','public.visit_financials','agency_id','UPDATE')
     ELSE NOT has_table_privilege('mycaresight_app','public.visit_adjustment_history','UPDATE') END scope_immutable
 FROM expected
)
SELECT *,forced_rls AND insert_policy_ok AND update_policy_ok AND old_row_linked AND insert_grant AND update_grant
  AND delete_denied AND scope_immutable AS write_access_pass FROM state ORDER BY table_name;
