-- 000: repeatable schema preflight; metadata only, no application rows.
-- Run in the selected Neon dev/uat database or Supabase source SQL editor.
-- Branch selection is external to SQL: current_database() alone cannot identify a Neon branch.
-- This file does not repair schema or apply any migration.
BEGIN TRANSACTION READ ONLY;

SELECT json_build_object(
'columns',(SELECT json_agg(c ORDER BY table_name,ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public') c),
'constraints',(SELECT json_agg(c ORDER BY table_name,name) FROM (SELECT r.relname AS table_name,c.conname AS name,c.contype AS type,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public') c),
'functions',(SELECT json_agg(f ORDER BY name,arguments) FROM (SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result,p.prosecdef AS security_definer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f') f),
'rls',(SELECT json_agg(t ORDER BY name) FROM (SELECT relname AS name,relrowsecurity AS enabled,relforcerowsecurity AS forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') t),
'policies',(SELECT json_agg(t ORDER BY tablename,policyname) FROM (SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public') t),
'triggers',(SELECT json_agg(t ORDER BY table_name,name) FROM (SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) t)
) AS metadata;

SELECT json_build_object(
'database',current_database(),
'version',current_setting('server_version'),
'roles',(SELECT json_agg(r) FROM (SELECT rolname,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('mycaresight_app','neondb_owner')) r),
'indexes',(SELECT json_agg(i ORDER BY tablename,indexname) FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public') i),
'application_functions',(SELECT json_agg(f ORDER BY schema_name,name,arguments) FROM (SELECT n.nspname AS schema_name,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND p.prokind='f' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) f)
) AS metadata;

COMMIT;
