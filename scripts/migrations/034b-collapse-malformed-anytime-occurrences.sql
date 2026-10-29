-- Collapse malformed descendant trees created by the original permissive 034 predicate.
-- Neon only. Only active, uncompleted rows with more than four code segments are eligible.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

CREATE TEMP TABLE migration_034b_guard (
  condition_met boolean NOT NULL CHECK (condition_met)
) ON COMMIT DROP;

INSERT INTO migration_034b_guard (condition_met)
VALUES (to_regclass('auth.users') IS NULL);

LOCK TABLE public.scheduled_visit_tasks IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE migration_034b_malformed ON COMMIT DROP AS
SELECT
  task.id,
  task.agency_id,
  task.scheduled_visit_id,
  task.created_at,
  string_to_array(task.legacy_task_code, '::') AS parts,
  array_to_string((string_to_array(task.legacy_task_code, '::'))[1:4], '::') AS canonical_code
FROM public.scheduled_visit_tasks AS task
JOIN public.scheduled_visits AS visit
  ON visit.id = task.scheduled_visit_id
 AND visit.agency_id = task.agency_id
WHERE task.legacy_task_code LIKE 'any::%'
  AND cardinality(string_to_array(task.legacy_task_code, '::')) > 4
  AND task.completed_at IS NULL
  AND visit.status NOT IN ('completed', 'missed', 'cancelled', 'voided');

-- Refuse to guess if any malformed row cannot be mapped to a valid intended occurrence.
INSERT INTO migration_034b_guard (condition_met)
SELECT NOT EXISTS (
  SELECT 1
  FROM migration_034b_malformed
  WHERE parts[1] <> 'any'
     OR parts[3] !~ '^[2-4]$'
     OR parts[4] !~ '^[1-4]$'
     OR parts[4]::integer > parts[3]::integer
);

-- Refuse ambiguous repair when more than one already-canonical row exists for a group.
INSERT INTO migration_034b_guard (condition_met)
SELECT NOT EXISTS (
  SELECT 1
  FROM migration_034b_malformed AS malformed
  JOIN public.scheduled_visit_tasks AS existing
    ON existing.scheduled_visit_id = malformed.scheduled_visit_id
   AND existing.legacy_task_code = malformed.canonical_code
  GROUP BY malformed.scheduled_visit_id, malformed.canonical_code
  HAVING count(DISTINCT existing.id) > 1
);

CREATE TEMP TABLE migration_034b_plan ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    malformed.*,
    first_value(malformed.id) OVER (
      PARTITION BY malformed.scheduled_visit_id, malformed.canonical_code
      ORDER BY malformed.created_at, malformed.id
    ) AS earliest_malformed_id
  FROM migration_034b_malformed AS malformed
), planned AS (
  SELECT
    ranked.*,
    COALESCE(existing.id, ranked.earliest_malformed_id) AS retained_id
  FROM ranked
  LEFT JOIN LATERAL (
    SELECT canonical.id
    FROM public.scheduled_visit_tasks AS canonical
    WHERE canonical.scheduled_visit_id = ranked.scheduled_visit_id
      AND canonical.legacy_task_code = ranked.canonical_code
    ORDER BY canonical.created_at, canonical.id
    LIMIT 1
  ) AS existing ON true
)
SELECT * FROM planned;

-- Record identifier-only evidence before removing migration-created descendants.
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT
  plan.agency_id,
  'scheduled_visit_tasks',
  plan.id,
  'REPAIR_ANYTIME_OCCURRENCE_REMOVE',
  NULL,
  jsonb_build_object(
    'source', 'migration_034b',
    'retained_record_id', plan.retained_id,
    'intended_total', plan.parts[3]::integer,
    'intended_ordinal', plan.parts[4]::integer
  )
FROM migration_034b_plan AS plan
WHERE plan.id <> plan.retained_id;

DELETE FROM public.scheduled_visit_tasks AS task
USING migration_034b_plan AS plan
WHERE task.id = plan.id
  AND plan.id <> plan.retained_id;

UPDATE public.scheduled_visit_tasks AS task
SET legacy_task_code = plan.canonical_code,
    updated_at = now()
FROM migration_034b_plan AS plan
WHERE task.id = plan.retained_id
  AND plan.id = plan.retained_id;

INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT DISTINCT ON (plan.scheduled_visit_id, plan.canonical_code)
  plan.agency_id,
  'scheduled_visit_tasks',
  plan.retained_id,
  'REPAIR_ANYTIME_OCCURRENCE',
  NULL,
  jsonb_build_object(
    'source', 'migration_034b',
    'removed_descendant_count', (
      SELECT count(*)
      FROM migration_034b_plan AS descendant
      WHERE descendant.scheduled_visit_id = plan.scheduled_visit_id
        AND descendant.canonical_code = plan.canonical_code
        AND descendant.id <> descendant.retained_id
    ),
    'intended_total', plan.parts[3]::integer,
    'intended_ordinal', plan.parts[4]::integer
  )
FROM migration_034b_plan AS plan
ORDER BY plan.scheduled_visit_id, plan.canonical_code, plan.created_at, plan.id;

COMMIT;
