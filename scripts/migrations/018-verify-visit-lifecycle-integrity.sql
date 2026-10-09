WITH behavior AS (
  SELECT
    public.compute_scheduled_visit_status(
      current_date - 1, '09:00'::time, '10:00'::time, NULL, gen_random_uuid()
    ) = 'scheduled' AS past_assigned_stays_scheduled,
    public.compute_scheduled_visit_status(
      current_date + 1, '09:00'::time, '10:00'::time, NULL, gen_random_uuid()
    ) = 'scheduled' AS future_assigned_is_scheduled,
    public.compute_scheduled_visit_status(
      current_date - 1, '09:00'::time, '10:00'::time, NULL, NULL
    ) = 'missed' AS past_unassigned_is_missed,
    public.compute_scheduled_visit_status(
      current_date + 1, '09:00'::time, '10:00'::time, NULL, NULL
    ) = 'unassigned' AS future_unassigned_is_open
), definitions AS (
  SELECT
    position('RETURN ''completed''' IN pg_get_functiondef(
      'public.compute_scheduled_visit_status(date,time without time zone,time without time zone,date,uuid)'::regprocedure
    )) = 0 AS cannot_compute_completed,
    position('RETURN ''in_progress''' IN pg_get_functiondef(
      'public.compute_scheduled_visit_status(date,time without time zone,time without time zone,date,uuid)'::regprocedure
    )) = 0 AS cannot_compute_in_progress,
    position('on_hold' IN pg_get_functiondef(
      'public.scheduled_visits_set_status_before_write()'::regprocedure
    )) > 0 AS trigger_preserves_on_hold
), permissions AS (
  SELECT
    has_function_privilege(
      'mycaresight_jobs', 'public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])', 'EXECUTE'
    ) AS jobs_can_sync,
    NOT has_function_privilege(
      'mycaresight_app', 'public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])', 'EXECUTE'
    ) AS app_cannot_sync
)
SELECT * FROM behavior CROSS JOIN definitions CROSS JOIN permissions;
