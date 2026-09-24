-- Read-only verification after 005; expect access_pass=true.
-- 002's pay-rate stage_pass is expected to become false after intentional access enablement.
SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
  has_table_privilege('mycaresight_app',c.oid,'SELECT') AS runtime_select,
  has_table_privilege('mycaresight_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS runtime_write,
  (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) AS policy_count,
  c.relrowsecurity AND c.relforcerowsecurity
    AND has_table_privilege('mycaresight_app',c.oid,'SELECT')
    AND NOT has_table_privilege('mycaresight_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND (SELECT count(*)=1 FROM pg_policy WHERE polrelid=c.oid)
    AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid
      AND p.polname='caregiver_pay_rates_scoped_select' AND p.polcmd='r'
      AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='mycaresight_app')]) AS access_pass
FROM pg_class c WHERE c.oid='public.caregiver_pay_rates'::regclass;

-- Inspect the installed expression as well; flags/names alone do not prove policy semantics.
SELECT policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename='caregiver_pay_rates';
