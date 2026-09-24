-- Metadata verification after 006; expect write_access_pass=true. Inspect policies below.
SELECT c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('mycaresight_app',c.oid,'SELECT') AS runtime_select,
 has_column_privilege('mycaresight_app',c.oid,'pay_rate','INSERT') AS insert_amount,
 has_column_privilege('mycaresight_app',c.oid,'effective_end','UPDATE') AS close_period,
 has_column_privilege('mycaresight_app',c.oid,'pay_rate','UPDATE') AS overwrite_amount,
 c.relrowsecurity AND c.relforcerowsecurity
 AND has_column_privilege('mycaresight_app',c.oid,'pay_rate','INSERT')
 AND has_column_privilege('mycaresight_app',c.oid,'effective_end','UPDATE')
 AND NOT has_column_privilege('mycaresight_app',c.oid,'pay_rate','UPDATE')
 AND NOT has_table_privilege('mycaresight_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND (SELECT count(*)=3 FROM pg_policy WHERE polrelid=c.oid)
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND tgname='caregiver_pay_rates_guard_timeline' AND tgenabled='O')
 AND EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.caregiver_pay_rates_live_start_key') AND indisvalid AND indisready)
 AS write_access_pass
FROM pg_class c WHERE c.oid='public.caregiver_pay_rates'::regclass;
SELECT policyname,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename='caregiver_pay_rates' ORDER BY policyname;
