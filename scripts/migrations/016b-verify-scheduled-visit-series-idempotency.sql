-- Read-only verification for migration 016b. Expect access_pass=true.
WITH index_state AS (
  SELECT count(*) = 1 AS unique_index_ok
  FROM pg_index index_record
  JOIN pg_class index_class ON index_class.oid = index_record.indexrelid
  JOIN pg_class table_class ON table_class.oid = index_record.indrelid
  JOIN pg_namespace schema_record ON schema_record.oid = table_class.relnamespace
  WHERE schema_record.nspname = 'public'
    AND table_class.relname = 'scheduled_visits'
    AND index_class.relname = 'scheduled_visits_series_date_unique'
    AND index_record.indisunique
    AND index_record.indisvalid
    AND pg_get_indexdef(index_record.indexrelid) LIKE '%(visit_series_id, visit_date)%'
    AND pg_get_expr(index_record.indpred, index_record.indrelid)
      = '(visit_series_id IS NOT NULL)'
), duplicate_state AS (
  SELECT count(*) = 0 AS duplicates_absent
  FROM (
    SELECT 1
    FROM public.scheduled_visits
    WHERE visit_series_id IS NOT NULL
    GROUP BY visit_series_id, visit_date
    HAVING count(*) > 1
  ) duplicates
)
SELECT
  index_state.unique_index_ok,
  duplicate_state.duplicates_absent,
  index_state.unique_index_ok AND duplicate_state.duplicates_absent AS access_pass
FROM index_state
CROSS JOIN duplicate_state;
