-- 031: Repair an explicit/default grant retained by migration 030 on existing Neon branches.
-- Apply to every Neon branch where 030 was applied. This changes privileges only, not data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '031 must not run against Supabase';
  END IF;
  IF to_regclass('public.visit_corrections') IS NULL THEN
    RAISE EXCEPTION '031 requires migration 030';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION '031 requires the restricted mycaresight_app role';
  END IF;
END
$preflight$;

REVOKE ALL ON TABLE public.visit_corrections FROM PUBLIC, mycaresight_app;
GRANT SELECT, INSERT ON TABLE public.visit_corrections TO mycaresight_app;

DO $verify$
BEGIN
  IF NOT has_table_privilege('mycaresight_app', 'public.visit_corrections', 'SELECT')
    OR NOT has_table_privilege('mycaresight_app', 'public.visit_corrections', 'INSERT')
    OR has_table_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,REFERENCES') THEN
    RAISE EXCEPTION '031 could not establish append-only runtime privileges; inspect role membership and object ownership';
  END IF;
END
$verify$;

COMMIT;
