-- Read-only verification for migration 025. Expect every boolean to be true
-- and every *_count value to be zero.
WITH catalog AS (
  SELECT
    count(*) FILTER (WHERE is_active) = 6 AS catalog_seed_ok,
    count(*) FILTER (WHERE key = 'care_operations') = 1 AS care_operations_ok,
    count(*) FILTER (WHERE key = 'caregiver_management') = 1 AS caregiver_management_separate
  FROM public.capability_catalog
), integrity AS (
  SELECT
    (SELECT count(*)::int FROM (
      SELECT plan_id, capability_key FROM public.plan_capabilities
      GROUP BY plan_id, capability_key HAVING count(*) > 1
    ) duplicate) AS duplicate_count,
    (SELECT count(*)::int
     FROM public.plan_capabilities plan_capability
     LEFT JOIN public.feature_plans plan ON plan.id = plan_capability.plan_id
     LEFT JOIN public.capability_catalog capability ON capability.key = plan_capability.capability_key
     WHERE plan.id IS NULL OR capability.key IS NULL) AS orphan_count,
    (SELECT count(*)::int FROM public.plan_capabilities
     WHERE capability_key IN ('care_visits', 'time_billing', 'clients_scheduling', 'caregivers'))
      AS legacy_key_count
), constraints AS (
  SELECT
    to_regclass('public.plan_features') IS NULL AS legacy_table_removed,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.plan_capabilities'::regclass
        AND conname = 'plan_capabilities_plan_capability_key'
        AND contype = 'u'
    ) AS unique_key_ok,
    (SELECT count(*) FROM pg_constraint
     WHERE conrelid = 'public.plan_capabilities'::regclass AND contype = 'f') = 2
      AS foreign_keys_ok,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.agencies'::regclass
        AND conname = 'agencies_plan_id_fkey'
        AND contype = 'f'
    ) AS agency_plan_fk_ok,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'feature_plans'
        AND indexname = 'feature_plans_name_key'
    ) AS plan_name_key_ok
), security AS (
  SELECT
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
     WHERE oid = 'public.capability_catalog'::regclass) AS catalog_rls_ok,
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
     WHERE oid = 'public.feature_plans'::regclass) AS plans_rls_ok,
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
     WHERE oid = 'public.plan_capabilities'::regclass) AS plan_capabilities_rls_ok,
    NOT has_table_privilege('public', 'public.capability_catalog', 'SELECT')
      AND NOT has_table_privilege('public', 'public.feature_plans', 'SELECT')
      AND NOT has_table_privilege('public', 'public.plan_capabilities', 'SELECT')
      AS public_blocked,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs')
      THEN NOT has_table_privilege('mycaresight_jobs', 'public.capability_catalog', 'SELECT')
        AND NOT has_table_privilege('mycaresight_jobs', 'public.feature_plans', 'SELECT')
        AND NOT has_table_privilege('mycaresight_jobs', 'public.plan_capabilities', 'SELECT')
      ELSE true
    END AS jobs_access_blocked,
    NOT has_function_privilege('public', 'public.plan_actor_is_platform_admin()', 'EXECUTE')
      AS helper_not_public
)
SELECT * FROM catalog CROSS JOIN integrity CROSS JOIN constraints CROSS JOIN security;
