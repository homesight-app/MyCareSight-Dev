-- Read-only verification for 014. Expect three rows with access_pass=true.
WITH expected(table_name,policy_count,index_count) AS (VALUES
 ('scheduled_visits',5,2),('scheduled_visit_tasks',5,1),('visit_series',3,1)
), state AS (
 SELECT e.*,
  c.relrowsecurity AND c.relforcerowsecurity forced_rls,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=e.table_name)=e.policy_count policies_ok,
  (SELECT count(*) FROM pg_indexes i WHERE i.schemaname='public' AND i.tablename=e.table_name
    AND i.indexname<>'scheduled_visits_pkey' AND i.indexname<>'scheduled_visit_tasks_pkey' AND i.indexname<>'visit_series_pkey')>=e.index_count indexes_ok,
  has_table_privilege('mycaresight_app','public.'||e.table_name,'SELECT') runtime_select,
  NOT has_column_privilege('mycaresight_app','public.'||e.table_name,'agency_id','UPDATE') agency_immutable,
  CASE WHEN e.table_name='scheduled_visits' THEN has_column_privilege('mycaresight_app','public.scheduled_visits','status','UPDATE')
    WHEN e.table_name='scheduled_visit_tasks' THEN has_column_privilege('mycaresight_app','public.scheduled_visit_tasks','completed_at','UPDATE')
    ELSE NOT has_table_privilege('mycaresight_app','public.visit_series','UPDATE,DELETE') END scoped_write
 FROM expected e JOIN pg_class c ON c.oid=to_regclass('public.'||e.table_name)
)
SELECT *,forced_rls AND policies_ok AND indexes_ok AND runtime_select AND agency_immutable AND scoped_write AS access_pass
FROM state ORDER BY table_name;

SELECT
 has_function_privilege('mycaresight_app','public.scheduling_caregiver_can_read(uuid,uuid)','EXECUTE') AS runtime_helper,
 NOT has_function_privilege('public','public.scheduling_caregiver_can_read(uuid,uuid)','EXECUTE') AS helper_not_public;
