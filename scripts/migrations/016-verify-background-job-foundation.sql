-- Read-only verification for migration 016. Expect one row with access_pass=true.
WITH expected_tables(table_name, minimum_indexes) AS (
  VALUES
    ('background_job_runs', 4),
    ('background_job_items', 6),
    ('background_job_outbox', 4)
), table_state AS (
  SELECT
    expected.table_name,
    to_regclass('public.' || expected.table_name) IS NOT NULL AS table_exists,
    (
      SELECT count(*) FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = expected.table_name
    ) >= expected.minimum_indexes AS indexes_ok,
    (
      SELECT relrowsecurity AND relforcerowsecurity
      FROM pg_class WHERE oid = to_regclass('public.' || expected.table_name)
    ) AS forced_rls,
    has_table_privilege('mycaresight_jobs', 'public.' || expected.table_name, 'SELECT,INSERT,UPDATE')
      AND NOT has_table_privilege('mycaresight_jobs', 'public.' || expected.table_name, 'DELETE')
      AS job_access_ok,
    NOT has_table_privilege('mycaresight_app', 'public.' || expected.table_name, 'SELECT')
      AND NOT has_table_privilege('public', 'public.' || expected.table_name, 'SELECT')
      AS blocked_from_app_and_public
  FROM expected_tables expected
), function_state AS (
  SELECT
    to_regprocedure('public.compute_scheduled_visit_status(date,time without time zone,time without time zone,date,uuid)') IS NOT NULL
      AND to_regprocedure('public.compute_scheduled_visit_status(date,time without time zone,time without time zone,uuid)') IS NOT NULL
      AND to_regprocedure('public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])') IS NOT NULL
      AS functions_exist,
    has_function_privilege(
      'mycaresight_jobs',
      'public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])',
      'EXECUTE'
    ) AS job_can_sync,
    NOT has_function_privilege(
      'mycaresight_app',
      'public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])',
      'EXECUTE'
    ) AND NOT has_function_privilege(
      'public',
      'public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])',
      'EXECUTE'
    ) AS sync_not_public
), role_state AS (
  SELECT count(*) = 1 AS role_ok
  FROM pg_roles
  WHERE rolname = 'mycaresight_jobs'
    AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls
), policy_state AS (
  SELECT count(*) = 8 AS policies_ok
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'background_job_runs_service_access',
      'background_job_items_service_access',
      'background_job_outbox_service_access',
      'visit_series_job_select',
      'scheduled_visits_job_select',
      'scheduled_visits_job_insert',
      'scheduled_visit_tasks_job_select',
      'scheduled_visit_tasks_job_insert'
    )
    AND roles = ARRAY['mycaresight_jobs']::name[]
), trigger_state AS (
  SELECT count(*) = 1 AS trigger_ok
  FROM pg_trigger
  WHERE tgrelid = 'public.scheduled_visits'::regclass
    AND tgname = 'scheduled_visits_status_before_write'
    AND NOT tgisinternal
), domain_state AS (
  SELECT
    has_column_privilege('mycaresight_jobs', 'public.visit_series', 'id', 'SELECT')
      AND has_column_privilege('mycaresight_jobs', 'public.scheduled_visits', 'id', 'SELECT')
      AND has_column_privilege('mycaresight_jobs', 'public.scheduled_visits', 'visit_date', 'INSERT')
      AND has_column_privilege('mycaresight_jobs', 'public.scheduled_visit_tasks', 'id', 'SELECT')
      AND has_column_privilege('mycaresight_jobs', 'public.scheduled_visit_tasks', 'scheduled_visit_id', 'INSERT')
      AND NOT has_table_privilege('mycaresight_jobs', 'public.scheduled_visits', 'UPDATE')
      AND NOT has_table_privilege('mycaresight_jobs', 'public.scheduled_visits', 'DELETE')
      AS scheduling_access_ok,
    has_column_privilege('mycaresight_jobs', 'public.user_profiles', 'email', 'SELECT')
      AND has_column_privilege('mycaresight_jobs', 'public.notifications', 'id', 'SELECT')
      AND NOT has_column_privilege('mycaresight_jobs', 'public.user_profiles', 'password_hash', 'SELECT')
      AND NOT has_table_privilege('mycaresight_jobs', 'public.leads', 'UPDATE')
      AND NOT has_table_privilege('mycaresight_jobs', 'public.leads', 'DELETE')
      AS reminder_access_ok
)
SELECT
  bool_and(table_exists) AS tables_ok,
  bool_and(indexes_ok) AS indexes_ok,
  bool_and(forced_rls) AS forced_rls,
  bool_and(job_access_ok) AS job_access_ok,
  bool_and(blocked_from_app_and_public) AS public_blocked,
  function_state.functions_exist,
  function_state.job_can_sync,
  function_state.sync_not_public,
  role_state.role_ok,
  policy_state.policies_ok,
  trigger_state.trigger_ok,
  domain_state.scheduling_access_ok,
  domain_state.reminder_access_ok,
  bool_and(
    table_exists AND indexes_ok AND forced_rls
    AND job_access_ok AND blocked_from_app_and_public
  )
    AND function_state.functions_exist
    AND function_state.job_can_sync
    AND function_state.sync_not_public
    AND role_state.role_ok
    AND policy_state.policies_ok
    AND trigger_state.trigger_ok
    AND domain_state.scheduling_access_ok
    AND domain_state.reminder_access_ok AS access_pass
FROM table_state
CROSS JOIN function_state
CROSS JOIN role_state
CROSS JOIN policy_state
CROSS JOIN trigger_state
CROSS JOIN domain_state
GROUP BY
  function_state.functions_exist,
  function_state.job_can_sync,
  function_state.sync_not_public,
  role_state.role_ok,
  policy_state.policies_ok,
  trigger_state.trigger_ok,
  domain_state.scheduling_access_ok,
  domain_state.reminder_access_ok;
