-- Read-only, aggregate-only verification after migration 034. Expected: splittable_rows = 0.
SELECT
  count(*) FILTER (
    WHERE task.legacy_task_code ~ '^any::[^:]+::[2-4]$'
      AND cardinality(string_to_array(task.legacy_task_code, '::')) = 3
      AND task.completed_at IS NULL
      AND visit.status NOT IN ('completed', 'missed', 'cancelled', 'voided')
  ) AS splittable_rows,
  count(*) FILTER (
    WHERE task.legacy_task_code ~ '^any::[^:]+::[2-4]::[1-4]$'
      AND cardinality(string_to_array(task.legacy_task_code, '::')) = 4
  ) AS individual_occurrence_rows,
  count(*) FILTER (
    WHERE task.legacy_task_code ~ '^any::[^:]+::[2-4]$'
      AND cardinality(string_to_array(task.legacy_task_code, '::')) = 3
      AND (task.completed_at IS NOT NULL
        OR visit.status IN ('completed', 'missed', 'cancelled', 'voided'))
  ) AS preserved_historical_combined_rows,
  count(*) FILTER (
    WHERE task.legacy_task_code LIKE 'any::%'
      AND cardinality(string_to_array(task.legacy_task_code, '::')) > 4
      AND task.completed_at IS NULL
      AND visit.status NOT IN ('completed', 'missed', 'cancelled', 'voided')
  ) AS malformed_active_occurrence_rows
FROM public.scheduled_visit_tasks task
JOIN public.scheduled_visits visit ON visit.id = task.scheduled_visit_id
  AND visit.agency_id = task.agency_id;
