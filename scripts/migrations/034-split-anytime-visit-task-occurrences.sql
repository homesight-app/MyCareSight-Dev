-- 034: Split uncompleted, active-visit Anytime 2-4x assignments into individual task rows.
-- Neon only. Completed tasks and terminal visits retain their historical evidence.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $split$
DECLARE
  task_row record;
  frequency integer;
  ordinal integer;
  next_sort integer;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '034 must not run against Supabase';
  END IF;
  IF to_regclass('public.scheduled_visit_tasks') IS NULL
     OR to_regclass('public.scheduled_visits') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '034 requires visit task, visit, and audit tables';
  END IF;

  FOR task_row IN
    SELECT task.id, task.agency_id, task.scheduled_visit_id, task.task_id,
           task.legacy_task_code
    FROM public.scheduled_visit_tasks task
    JOIN public.scheduled_visits visit ON visit.id = task.scheduled_visit_id
      AND visit.agency_id = task.agency_id
    WHERE task.legacy_task_code ~ '^any::[^:]+::[2-4]$'
      AND cardinality(string_to_array(task.legacy_task_code, '::')) = 3
      AND task.completed_at IS NULL
      AND visit.status NOT IN ('completed', 'missed', 'cancelled', 'voided')
    ORDER BY task.scheduled_visit_id, task.sort_order, task.id
    FOR UPDATE OF task
  LOOP
    frequency := right(task_row.legacy_task_code, 1)::integer;
    SELECT coalesce(max(sort_order), 0) INTO next_sort
      FROM public.scheduled_visit_tasks
      WHERE scheduled_visit_id = task_row.scheduled_visit_id;

    UPDATE public.scheduled_visit_tasks
      SET legacy_task_code = task_row.legacy_task_code || '::1', updated_at = now()
      WHERE id = task_row.id AND completed_at IS NULL;

    FOR ordinal IN 2..frequency LOOP
      INSERT INTO public.scheduled_visit_tasks (
        agency_id, scheduled_visit_id, task_id, legacy_task_code, sort_order
      ) VALUES (
        task_row.agency_id, task_row.scheduled_visit_id, task_row.task_id,
        task_row.legacy_task_code || '::' || ordinal, next_sort + ordinal - 1
      );
    END LOOP;

    INSERT INTO public.audit_log (
      agency_id, table_name, record_id, action, performed_by_user_id, details
    ) VALUES (
      task_row.agency_id, 'scheduled_visit_tasks', task_row.id,
      'SPLIT_ANYTIME_OCCURRENCES', NULL,
      jsonb_build_object('source', 'migration_034', 'occurrence_count', frequency)
    );
  END LOOP;
END
$split$;

COMMIT;
