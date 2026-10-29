-- Set-based repair for remaining active combined Anytime assignments after 034.
-- Neon only. Existing occurrence rows are retained and missing ordinals are added.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

CREATE TEMP TABLE migration_034a_guard (
  is_neon boolean NOT NULL CHECK (is_neon)
) ON COMMIT DROP;

INSERT INTO migration_034a_guard (is_neon)
VALUES (to_regclass('auth.users') IS NULL);

CREATE TEMP TABLE migration_034a_targets ON COMMIT DROP AS
WITH locked AS MATERIALIZED (
  SELECT
    task.id,
    task.agency_id,
    task.scheduled_visit_id,
    task.task_id,
    task.legacy_task_code,
    task.sort_order,
    right(task.legacy_task_code, 1)::integer AS frequency
  FROM public.scheduled_visit_tasks AS task
  JOIN public.scheduled_visits AS visit
    ON visit.id = task.scheduled_visit_id
   AND visit.agency_id = task.agency_id
  WHERE task.legacy_task_code ~ '^any::[^:]+::[2-4]$'
    AND cardinality(string_to_array(task.legacy_task_code, '::')) = 3
    AND task.completed_at IS NULL
    AND visit.status NOT IN ('completed', 'missed', 'cancelled', 'voided')
  ORDER BY task.scheduled_visit_id, task.sort_order, task.id
  FOR UPDATE OF task
), numbered AS (
  SELECT
    locked.*,
    (
      COALESCE((
        SELECT max(sibling.sort_order)
        FROM public.scheduled_visit_tasks AS sibling
        WHERE sibling.scheduled_visit_id = locked.scheduled_visit_id
      ), 0)
      + COALESCE(sum(locked.frequency - 1) OVER (
          PARTITION BY locked.scheduled_visit_id
          ORDER BY locked.sort_order, locked.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)
    )::integer AS next_sort
  FROM locked
)
SELECT * FROM numbered;

UPDATE public.scheduled_visit_tasks AS task
SET legacy_task_code = target.legacy_task_code || '::1',
    updated_at = now()
FROM migration_034a_targets AS target
WHERE task.id = target.id
  AND task.completed_at IS NULL;

INSERT INTO public.scheduled_visit_tasks (
  agency_id, scheduled_visit_id, task_id, legacy_task_code, sort_order
)
SELECT
  target.agency_id,
  target.scheduled_visit_id,
  target.task_id,
  target.legacy_task_code || '::' || ordinal.value,
  target.next_sort + ordinal.value - 1
FROM migration_034a_targets AS target
CROSS JOIN LATERAL generate_series(2, target.frequency) AS ordinal(value)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scheduled_visit_tasks AS existing
  WHERE existing.scheduled_visit_id = target.scheduled_visit_id
    AND existing.legacy_task_code = target.legacy_task_code || '::' || ordinal.value
);

INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT
  target.agency_id,
  'scheduled_visit_tasks',
  target.id,
  'SPLIT_ANYTIME_OCCURRENCES',
  NULL,
  jsonb_build_object(
    'source', 'migration_034a',
    'occurrence_count', target.frequency
  )
FROM migration_034a_targets AS target;

COMMIT;
