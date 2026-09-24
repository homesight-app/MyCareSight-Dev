-- Read-only verification for 010. Expect one row with every boolean true.
WITH state AS (
  SELECT
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.visit_time_entries'::regclass) AS forced_rls,
    (SELECT count(*)=3 FROM pg_policies WHERE schemaname='public' AND tablename='visit_time_entries'
      AND policyname LIKE 'visit_time_entries_caregiver_%') AS three_caregiver_policies,
    has_column_privilege('mycaresight_app','public.visit_time_entries','clock_in_time','INSERT') AS can_insert_clock_in,
    has_column_privilege('mycaresight_app','public.visit_time_entries','clock_in_time','UPDATE') AS can_set_missing_clock_in,
    has_column_privilege('mycaresight_app','public.visit_time_entries','caregiver_notes','UPDATE') AS can_update_notes,
    NOT has_column_privilege('mycaresight_app','public.visit_time_entries','agency_id','UPDATE') AS cannot_update_scope,
    has_column_privilege('mycaresight_app','public.scheduled_visit_tasks','completed_at','UPDATE') AS can_complete_task,
    NOT has_column_privilege('mycaresight_app','public.scheduled_visit_tasks','notes','UPDATE') AS cannot_update_task_content,
    NOT has_table_privilege('mycaresight_app','public.visit_financials','INSERT') AS no_financial_insert,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.visit_time_entries'::regclass
      AND tgname='visit_time_entries_sync_financial_on_clock_out' AND tgenabled='O' AND NOT tgisinternal) AS financial_trigger,
    has_function_privilege('mycaresight_app','public.caregiver_can_execute_visit(uuid,uuid)','EXECUTE') AS helper_execute,
    NOT has_function_privilege('public','public.caregiver_can_execute_visit(uuid,uuid)','EXECUTE') AS helper_not_public
)
SELECT *, forced_rls AND three_caregiver_policies AND can_insert_clock_in AND can_set_missing_clock_in AND can_update_notes
  AND cannot_update_scope AND can_complete_task AND cannot_update_task_content AND no_financial_insert
  AND financial_trigger AND helper_execute AND helper_not_public AS access_pass
FROM state;
