SELECT
  to_regclass('public.lead_integration_credentials') IS NOT NULL AS credentials_table_ok,
  to_regclass('public.lead_integration_deliveries') IS NOT NULL AS deliveries_table_ok,
  to_regclass('public.lead_integration_rate_limit_events') IS NOT NULL AS rate_limits_table_ok,
  to_regclass('public.lead_integration_delivery_idempotency_unique') IS NOT NULL AS idempotency_constraint_ok,
  NOT has_table_privilege('public', 'public.lead_integration_credentials', 'SELECT') AS public_credentials_blocked,
  NOT has_table_privilege('public', 'public.lead_integration_deliveries', 'SELECT') AS public_deliveries_blocked,
  has_table_privilege('mycaresight_app', 'public.lead_integration_credentials', 'SELECT,INSERT,UPDATE') AS app_credentials_ok,
  has_table_privilege('mycaresight_app', 'public.lead_integration_deliveries', 'SELECT,INSERT') AS app_deliveries_ok,
  has_table_privilege('mycaresight_app', 'public.lead_integration_rate_limit_events', 'SELECT,INSERT,DELETE') AS app_rate_limits_ok,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs')
    THEN NOT has_table_privilege('mycaresight_jobs', 'public.lead_integration_credentials', 'SELECT')
      AND NOT has_table_privilege('mycaresight_jobs', 'public.lead_integration_deliveries', 'SELECT')
    ELSE true
  END AS jobs_access_blocked;
