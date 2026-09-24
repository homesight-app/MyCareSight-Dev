-- Read-only verification for staged migration 002.
-- Run as the migration owner in the selected Neon branch. Every stage_pass must be true.
-- Metadata only: this does not read application records.
BEGIN TRANSACTION READ ONLY;
WITH expected(table_name, columns, primary_keys, unique_constraints, foreign_keys, checks, triggers, indexes) AS (
  VALUES
    ('caregiver_pay_rates', 10, 1, 0, 2, 1, 1, 4),
    ('credential_catalog', 9, 1, 1, 0, 1, 1, 2),
    ('internal_notes', 11, 1, 0, 5, 2, 0, 4),
    ('visit_adjustment_history', 11, 1, 0, 3, 0, 0, 2),
    ('visit_approvals', 16, 1, 1, 6, 1, 1, 4),
    ('visit_financials', 23, 1, 2, 8, 3, 1, 5),
    ('visit_time_entries', 20, 1, 1, 4, 1, 1, 3)
), actual AS (
  SELECT e.*, c.oid,
    c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
    (SELECT count(*) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS actual_columns,
    (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p') AS actual_primary_keys,
    (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='u') AS actual_unique_constraints,
    (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f') AS actual_foreign_keys,
    (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='c') AS actual_checks,
    (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS actual_triggers,
    (SELECT count(*) FROM pg_index i WHERE i.indrelid=c.oid AND i.indisvalid AND i.indisready) AS actual_indexes,
    (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
    COALESCE(has_table_privilege('mycaresight_app', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), true) AS runtime_has_privileges
  FROM expected e
  LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I', e.table_name))
)
SELECT table_name, actual_columns, actual_primary_keys, actual_unique_constraints,
  actual_foreign_keys, actual_checks, actual_triggers, actual_indexes, rls_enabled, rls_forced, policies,
  runtime_has_privileges,
  COALESCE(oid IS NOT NULL AND columns=actual_columns AND primary_keys=actual_primary_keys
    AND unique_constraints=actual_unique_constraints AND foreign_keys=actual_foreign_keys
    AND checks=actual_checks AND triggers=actual_triggers AND indexes=actual_indexes
    AND rls_enabled AND rls_forced AND policies=0 AND NOT runtime_has_privileges, false) AS stage_pass
FROM actual ORDER BY table_name;
COMMIT;
