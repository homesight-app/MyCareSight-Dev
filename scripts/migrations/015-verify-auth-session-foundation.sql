-- Read-only verification for 015. Expect one row with access_pass=true.
WITH expected(table_name, index_count) AS (
  VALUES
    ('auth_sessions', 3),
    ('password_reset_tokens', 3),
    ('auth_rate_limit_events', 3)
), state AS (
  SELECT
    expected.table_name,
    to_regclass('public.' || expected.table_name) IS NOT NULL AS table_exists,
    (
      SELECT count(*)
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = expected.table_name
    ) >= expected.index_count AS indexes_ok,
    has_table_privilege('mycaresight_app', 'public.' || expected.table_name, 'SELECT') AS runtime_select,
    NOT has_table_privilege('public', 'public.' || expected.table_name, 'SELECT') AS not_public
  FROM expected
), trigger_state AS (
  SELECT
    count(*) FILTER (WHERE tgname = 'user_profiles_revoke_auth_sessions') = 1
      AND count(*) FILTER (WHERE tgname = 'user_agency_roles_revoke_auth_sessions') = 1 AS triggers_ok
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('user_profiles_revoke_auth_sessions', 'user_agency_roles_revoke_auth_sessions')
)
SELECT
  bool_and(table_exists) AS tables_ok,
  bool_and(indexes_ok) AS indexes_ok,
  bool_and(runtime_select) AS runtime_access_ok,
  bool_and(not_public) AS public_blocked,
  trigger_state.triggers_ok,
  bool_and(table_exists AND indexes_ok AND runtime_select AND not_public)
    AND trigger_state.triggers_ok AS access_pass
FROM state
CROSS JOIN trigger_state
GROUP BY trigger_state.triggers_ok;
