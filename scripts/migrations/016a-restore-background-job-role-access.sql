-- Restore least-privilege grants and RLS policies after the Neon job role is
-- reset or recreated. Safe to apply repeatedly after migration 016.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_jobs'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Restricted mycaresight_jobs role is missing';
  END IF;

  IF to_regclass('public.background_job_runs') IS NULL
     OR to_regclass('public.background_job_items') IS NULL
     OR to_regclass('public.background_job_outbox') IS NULL
     OR to_regprocedure('public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Migration 016 must be applied before 016a';
  END IF;
END
$preflight$;

ALTER TABLE public.background_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS background_job_runs_service_access ON public.background_job_runs;
DROP POLICY IF EXISTS background_job_items_service_access ON public.background_job_items;
DROP POLICY IF EXISTS background_job_outbox_service_access ON public.background_job_outbox;
DROP POLICY IF EXISTS visit_series_job_select ON public.visit_series;
DROP POLICY IF EXISTS scheduled_visits_job_select ON public.scheduled_visits;
DROP POLICY IF EXISTS scheduled_visits_job_insert ON public.scheduled_visits;
DROP POLICY IF EXISTS scheduled_visit_tasks_job_select ON public.scheduled_visit_tasks;
DROP POLICY IF EXISTS scheduled_visit_tasks_job_insert ON public.scheduled_visit_tasks;

CREATE POLICY background_job_runs_service_access
  ON public.background_job_runs FOR ALL TO mycaresight_jobs
  USING (current_user = 'mycaresight_jobs')
  WITH CHECK (current_user = 'mycaresight_jobs');
CREATE POLICY background_job_items_service_access
  ON public.background_job_items FOR ALL TO mycaresight_jobs
  USING (current_user = 'mycaresight_jobs')
  WITH CHECK (current_user = 'mycaresight_jobs');
CREATE POLICY background_job_outbox_service_access
  ON public.background_job_outbox FOR ALL TO mycaresight_jobs
  USING (current_user = 'mycaresight_jobs')
  WITH CHECK (current_user = 'mycaresight_jobs');

CREATE POLICY visit_series_job_select
  ON public.visit_series FOR SELECT TO mycaresight_jobs
  USING (current_user = 'mycaresight_jobs');
CREATE POLICY scheduled_visits_job_select
  ON public.scheduled_visits FOR SELECT TO mycaresight_jobs
  USING (current_user = 'mycaresight_jobs');
CREATE POLICY scheduled_visits_job_insert
  ON public.scheduled_visits FOR INSERT TO mycaresight_jobs
  WITH CHECK (
    current_user = 'mycaresight_jobs'
    AND EXISTS (
      SELECT 1 FROM public.visit_series series
      WHERE series.id = visit_series_id
        AND series.agency_id = scheduled_visits.agency_id
        AND series.patient_id = scheduled_visits.patient_id
    )
  );
CREATE POLICY scheduled_visit_tasks_job_select
  ON public.scheduled_visit_tasks FOR SELECT TO mycaresight_jobs
  USING (
    current_user = 'mycaresight_jobs'
    AND EXISTS (
      SELECT 1 FROM public.scheduled_visits visit
      WHERE visit.id = scheduled_visit_id
        AND visit.agency_id = scheduled_visit_tasks.agency_id
    )
  );
CREATE POLICY scheduled_visit_tasks_job_insert
  ON public.scheduled_visit_tasks FOR INSERT TO mycaresight_jobs
  WITH CHECK (
    current_user = 'mycaresight_jobs'
    AND EXISTS (
      SELECT 1 FROM public.scheduled_visits visit
      WHERE visit.id = scheduled_visit_id
        AND visit.agency_id = scheduled_visit_tasks.agency_id
    )
  );

REVOKE ALL ON public.background_job_runs, public.background_job_items,
  public.background_job_outbox FROM PUBLIC, mycaresight_app, mycaresight_jobs;
GRANT SELECT, INSERT, UPDATE ON public.background_job_runs,
  public.background_job_items, public.background_job_outbox TO mycaresight_jobs;

REVOKE ALL ON public.visit_series, public.scheduled_visits,
  public.scheduled_visit_tasks FROM mycaresight_jobs;
GRANT SELECT (
  id, agency_id, patient_id, primary_caregiver_member_id, contract_id,
  service_type, series_name, repeat_frequency, days_of_week, repeat_start,
  repeat_end, notes, status, end_day_offset
) ON public.visit_series TO mycaresight_jobs;
GRANT SELECT (
  id, agency_id, visit_series_id, patient_id, caregiver_member_id, contract_id,
  service_type, visit_date, scheduled_start_time, scheduled_end_time,
  description, notes, visit_type, status, is_recurring, patient_address_id,
  mileage_miles, scheduled_end_date
) ON public.scheduled_visits TO mycaresight_jobs;
GRANT INSERT (
  agency_id, visit_series_id, patient_id, caregiver_member_id, contract_id,
  service_type, visit_date, scheduled_start_time, scheduled_end_time,
  description, notes, visit_type, status, is_recurring, patient_address_id,
  mileage_miles, scheduled_end_date
) ON public.scheduled_visits TO mycaresight_jobs;
GRANT SELECT (
  id, agency_id, scheduled_visit_id, task_id, legacy_task_code, sort_order, notes
) ON public.scheduled_visit_tasks TO mycaresight_jobs;
GRANT INSERT (
  agency_id, scheduled_visit_id, task_id, legacy_task_code, sort_order, notes
) ON public.scheduled_visit_tasks TO mycaresight_jobs;

REVOKE ALL ON public.lead_tasks, public.leads, public.user_profiles,
  public.notifications FROM mycaresight_jobs;
GRANT SELECT (id, lead_id, created_by, assigned_to, due_date, completed_at)
  ON public.lead_tasks TO mycaresight_jobs;
GRANT SELECT (id, agency_id) ON public.leads TO mycaresight_jobs;
GRANT SELECT (id, email, is_active) ON public.user_profiles TO mycaresight_jobs;
GRANT INSERT (user_id, title, type, message, icon_type, action_url)
  ON public.notifications TO mycaresight_jobs;
GRANT SELECT (id) ON public.notifications TO mycaresight_jobs;

REVOKE ALL ON FUNCTION public.compute_scheduled_visit_status(date,time,time,date,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_scheduled_visit_status(date,time,time,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])
  FROM PUBLIC, mycaresight_app;
REVOKE ALL ON FUNCTION public.scheduled_visits_set_status_before_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_scheduled_visit_status(date,time,time,date,uuid)
  TO mycaresight_app, mycaresight_jobs;
GRANT EXECUTE ON FUNCTION public.compute_scheduled_visit_status(date,time,time,uuid)
  TO mycaresight_app, mycaresight_jobs;
GRANT EXECUTE ON FUNCTION public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])
  TO mycaresight_jobs;

COMMIT;
