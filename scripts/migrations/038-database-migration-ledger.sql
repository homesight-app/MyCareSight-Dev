-- Bootstrap the provider-neutral migration ledger used by controlled releases.
-- This file is intentionally transaction-control free; the migration runner owns
-- the transaction and records the migration in the same commit.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

CREATE TABLE public.schema_migrations (
  migration_id text PRIMARY KEY,
  file_name text NOT NULL UNIQUE,
  checksum_sha256 text NOT NULL,
  release_sha text,
  target_environment text NOT NULL,
  applied_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  applied_by text NOT NULL DEFAULT current_user,
  execution_ms integer NOT NULL DEFAULT 0,
  verifier_file text,
  is_baseline boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT schema_migrations_id_format
    CHECK (migration_id ~ '^[0-9]{3}[a-z]?(?:-[a-z0-9][a-z0-9-]*)?$'),
  CONSTRAINT schema_migrations_checksum_format
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT schema_migrations_release_sha_format
    CHECK (release_sha IS NULL OR release_sha ~ '^[0-9a-f]{40}$'),
  CONSTRAINT schema_migrations_execution_ms_nonnegative
    CHECK (execution_ms >= 0),
  CONSTRAINT schema_migrations_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.schema_migrations IS
  'Append-only, non-PHI evidence of checksummed database migrations.';

REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app') THEN
    REVOKE ALL ON TABLE public.schema_migrations FROM mycaresight_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON TABLE public.schema_migrations FROM mycaresight_jobs;
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION public.prevent_schema_migration_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'schema_migrations is append-only';
END
$function$;

REVOKE ALL ON FUNCTION public.prevent_schema_migration_mutation() FROM PUBLIC;

CREATE TRIGGER schema_migrations_append_only
BEFORE UPDATE OR DELETE ON public.schema_migrations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_schema_migration_mutation();
