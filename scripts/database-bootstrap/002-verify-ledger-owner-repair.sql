SELECT
  pg_get_userbyid(ledger.relowner) = 'mycaresight_schema_owner' AS ledger_owner_ok,
  pg_get_userbyid(mutation_function.proowner) = 'mycaresight_schema_owner' AS function_owner_ok,
  has_table_privilege(
    'mycaresight_schema_owner',
    'public.schema_migrations',
    'SELECT,INSERT'
  ) AS owner_can_read_and_record,
  NOT has_table_privilege('public', 'public.schema_migrations', 'SELECT')
    AND NOT has_table_privilege('public', 'public.schema_migrations', 'INSERT')
    AS public_has_no_ledger_access,
  NOT has_table_privilege('mycaresight_app', 'public.schema_migrations', 'SELECT')
    AND NOT has_table_privilege('mycaresight_app', 'public.schema_migrations', 'INSERT')
    AND NOT has_table_privilege('mycaresight_jobs', 'public.schema_migrations', 'SELECT')
    AND NOT has_table_privilege('mycaresight_jobs', 'public.schema_migrations', 'INSERT')
    AS runtime_roles_have_no_ledger_access,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = ledger.oid
      AND tgname = 'schema_migrations_append_only'
      AND NOT tgisinternal
  ) AS append_only_trigger_exists
FROM pg_catalog.pg_class ledger
JOIN pg_catalog.pg_namespace ledger_schema ON ledger_schema.oid = ledger.relnamespace
CROSS JOIN pg_catalog.pg_proc mutation_function
JOIN pg_catalog.pg_namespace function_schema
  ON function_schema.oid = mutation_function.pronamespace
WHERE ledger_schema.nspname = 'public'
  AND ledger.relname = 'schema_migrations'
  AND function_schema.nspname = 'public'
  AND mutation_function.proname = 'prevent_schema_migration_mutation'
  AND pg_catalog.pg_get_function_identity_arguments(mutation_function.oid) = '';
