-- Read-only metadata verification after 007. Expect read_access_pass=true.
SELECT c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('mycaresight_app',c.oid,'SELECT') AS runtime_select,
 has_table_privilege('mycaresight_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_any_column_privilege('mycaresight_app',c.oid,'INSERT,UPDATE,REFERENCES') AS runtime_write,
 c.relrowsecurity AND c.relforcerowsecurity
 AND has_table_privilege('mycaresight_app',c.oid,'SELECT')
 AND NOT has_table_privilege('mycaresight_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND NOT has_any_column_privilege('mycaresight_app',c.oid,'INSERT,UPDATE,REFERENCES')
 AND (SELECT count(*)=1 FROM pg_policy p WHERE p.polrelid=c.oid)
 AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid
  AND p.polname='internal_notes_scoped_select' AND p.polcmd='r'
  AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='mycaresight_app')])
 AS read_access_pass
FROM pg_class c WHERE c.oid='public.internal_notes'::regclass;
SELECT policyname,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename='internal_notes' ORDER BY policyname;
