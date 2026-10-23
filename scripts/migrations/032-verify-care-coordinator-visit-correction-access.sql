-- Read-only verification after 032. Expected: all booleans true; policy_count = 2.
SELECT
  EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.visit_corrections')
    AND relrowsecurity AND relforcerowsecurity) AS forced_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'visit_corrections') AS policy_count,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'visit_corrections' AND policyname = 'visit_corrections_manager_read'
    AND cmd = 'SELECT' AND qual LIKE '%care_coordinator%') AS coordinator_read_policy,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'visit_corrections' AND policyname = 'visit_corrections_manager_insert'
    AND cmd = 'INSERT' AND with_check LIKE '%care_coordinator%') AS coordinator_insert_policy,
  has_table_privilege('mycaresight_app', 'public.visit_corrections', 'SELECT') AS app_can_read,
  has_table_privilege('mycaresight_app', 'public.visit_corrections', 'INSERT') AS app_can_insert,
  NOT has_table_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT has_any_column_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,REFERENCES')
    AS app_cannot_change_history,
  (SELECT count(*) FROM public.visit_corrections) AS correction_count;
