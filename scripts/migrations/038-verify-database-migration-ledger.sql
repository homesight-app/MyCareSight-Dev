SELECT
  to_regclass('public.schema_migrations') IS NOT NULL AS table_exists,
  COALESCE((
    SELECT count(*) = 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = to_regclass('public.schema_migrations')
      AND tgname = 'schema_migrations_append_only'
      AND NOT tgisinternal
  ), false) AS append_only_trigger_exists,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
      AND grantee = 'PUBLIC'
      AND privilege_type = 'SELECT'
  ) AS public_cannot_read,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
      AND grantee = 'PUBLIC'
      AND privilege_type = 'INSERT'
  ) AS public_cannot_insert,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
      AND grantee IN ('mycaresight_app', 'mycaresight_jobs')
  ) AS runtime_roles_have_no_grants,
  COALESCE((
    SELECT count(*) = 11
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
      AND column_name IN (
        'migration_id', 'file_name', 'checksum_sha256', 'release_sha',
        'target_environment', 'applied_at', 'applied_by', 'execution_ms',
        'verifier_file', 'is_baseline', 'metadata'
      )
  ), false) AS expected_columns_exist;
