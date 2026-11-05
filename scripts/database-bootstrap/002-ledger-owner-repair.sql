-- One-time owner-run repair for ledgers created manually before the controlled runner.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $repair$
BEGIN
  IF session_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'ledger ownership repair must be run as neondb_owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_schema_owner') THEN
    RAISE EXCEPTION 'mycaresight_schema_owner must already exist';
  END IF;
  IF NOT pg_has_role('neondb_owner', 'mycaresight_schema_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'neondb_owner must be a member of mycaresight_schema_owner';
  END IF;
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'public.schema_migrations must already exist';
  END IF;
  IF to_regprocedure('public.prevent_schema_migration_mutation()') IS NULL THEN
    RAISE EXCEPTION 'append-only ledger function must already exist';
  END IF;
END
$repair$;

ALTER TABLE public.schema_migrations OWNER TO mycaresight_schema_owner;
ALTER FUNCTION public.prevent_schema_migration_mutation() OWNER TO mycaresight_schema_owner;

REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_schema_migration_mutation() FROM PUBLIC;

DO $repair$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app') THEN
    REVOKE ALL ON TABLE public.schema_migrations FROM mycaresight_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON TABLE public.schema_migrations FROM mycaresight_jobs;
  END IF;
END
$repair$;

COMMIT;
