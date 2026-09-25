-- 016: HIPAA-conscious, scalable background-job foundation for Azure Functions + Neon.
-- Run as the Neon branch owner after scripts/neon-job-role-setup.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE
  required_table text;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '016 must not run against Supabase';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_jobs'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Run scripts/neon-job-role-setup.sql with a restricted mycaresight_jobs role first';
  END IF;

  FOREACH required_table IN ARRAY ARRAY[
    'visit_series', 'scheduled_visits', 'scheduled_visit_tasks',
    'lead_tasks', 'leads', 'user_profiles', 'notifications'
  ] LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'Missing prerequisite table: %', required_table;
    END IF;
  END LOOP;

  IF to_regclass('public.background_job_runs') IS NOT NULL
     OR to_regclass('public.background_job_items') IS NOT NULL
     OR to_regclass('public.background_job_outbox') IS NOT NULL THEN
    RAISE EXCEPTION '016 job tables already exist; use the verification script instead of rerunning';
  END IF;
END
$preflight$;

CREATE TABLE public.background_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL CHECK (job_name IN (
    'sync-visit-statuses',
    'discover-visit-series-refill',
    'dispatch-job-outbox',
    'discover-lead-task-reminders'
  )),
  schedule_key text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partially_failed', 'failed')),
  code_version text,
  examined_count integer NOT NULL DEFAULT 0 CHECK (examined_count >= 0),
  queued_count integer NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  succeeded_count integer NOT NULL DEFAULT 0 CHECK (succeeded_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT background_job_runs_schedule_unique UNIQUE (job_name, schedule_key),
  CONSTRAINT background_job_runs_error_code_safe CHECK (
    error_code IS NULL OR error_code ~ '^[A-Z0-9_:-]{1,100}$'
  ),
  CONSTRAINT background_job_runs_finished_state CHECK (
    (status = 'running' AND finished_at IS NULL)
    OR (status <> 'running' AND finished_at IS NOT NULL)
  )
);

CREATE TABLE public.background_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.background_job_runs(id) ON DELETE RESTRICT,
  job_name text NOT NULL CHECK (job_name IN (
    'refill-visit-series',
    'deliver-lead-task-reminder'
  )),
  agency_id uuid,
  subject_type text NOT NULL CHECK (subject_type IN ('visit_series', 'lead_task_recipient')),
  subject_id uuid NOT NULL,
  recipient_user_id uuid,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'processing', 'succeeded', 'skipped', 'retry', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz,
  result_record_id uuid,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT background_job_items_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT background_job_items_error_code_safe CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_:-]{1,100}$'
  ),
  CONSTRAINT background_job_items_recipient_shape CHECK (
    (subject_type = 'visit_series' AND recipient_user_id IS NULL)
    OR (subject_type = 'lead_task_recipient' AND recipient_user_id IS NOT NULL)
  )
);

CREATE TABLE public.background_job_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id uuid NOT NULL UNIQUE
    REFERENCES public.background_job_items(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'publishing', 'published', 'retry', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz,
  published_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT background_job_outbox_error_code_safe CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_:-]{1,100}$'
  )
);

CREATE INDEX background_job_runs_started_idx
  ON public.background_job_runs(job_name, started_at DESC, id);
CREATE INDEX background_job_runs_failures_idx
  ON public.background_job_runs(started_at DESC, id)
  WHERE status IN ('partially_failed', 'failed');
CREATE INDEX background_job_items_claim_idx
  ON public.background_job_items(job_name, available_at, created_at, id)
  WHERE status IN ('pending', 'retry');
CREATE INDEX background_job_items_run_idx
  ON public.background_job_items(run_id, status, id);
CREATE INDEX background_job_items_agency_idx
  ON public.background_job_items(agency_id, created_at DESC, id)
  WHERE agency_id IS NOT NULL;
CREATE INDEX background_job_items_dead_letter_idx
  ON public.background_job_items(updated_at DESC, id)
  WHERE status = 'dead_letter';
CREATE INDEX background_job_outbox_claim_idx
  ON public.background_job_outbox(available_at, created_at, id)
  WHERE status IN ('pending', 'retry');
CREATE INDEX background_job_outbox_dead_letter_idx
  ON public.background_job_outbox(updated_at DESC, id)
  WHERE status = 'dead_letter';

-- Discovery and status-sync indexes remain bounded as data volume grows.
CREATE INDEX IF NOT EXISTS lead_tasks_due_incomplete_idx
  ON public.lead_tasks(due_date, id)
  INCLUDE (lead_id, created_by, assigned_to)
  WHERE completed_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS visit_series_active_refill_idx
  ON public.visit_series(id)
  INCLUDE (agency_id, patient_id, repeat_start, repeat_end)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS scheduled_visits_status_sync_idx
  ON public.scheduled_visits(visit_date, scheduled_end_date, id)
  INCLUDE (scheduled_start_time, scheduled_end_time, caregiver_member_id, status)
  WHERE status NOT IN ('completed', 'missed', 'cancelled', 'voided');

ALTER TABLE public.background_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_outbox FORCE ROW LEVEL SECURITY;

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

-- Existing scheduling tables are FORCE RLS. The job identity receives explicit
-- service policies plus column-level grants; it does not inherit app-user access.
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

CREATE FUNCTION public.compute_scheduled_visit_status(
  p_visit_date date,
  p_start_time time,
  p_end_time time,
  p_scheduled_end_date date,
  p_caregiver_member_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  current_ts timestamptz := now();
  start_ts timestamptz;
  end_ts timestamptz;
  effective_end_date date := COALESCE(p_scheduled_end_date, p_visit_date);
BEGIN
  IF p_visit_date IS NULL THEN
    RAISE EXCEPTION 'visit date is required';
  END IF;

  start_ts := make_timestamptz(
    extract(year FROM p_visit_date)::integer,
    extract(month FROM p_visit_date)::integer,
    extract(day FROM p_visit_date)::integer,
    COALESCE(extract(hour FROM p_start_time)::integer, 0),
    COALESCE(extract(minute FROM p_start_time)::integer, 0),
    0,
    'UTC'
  );
  end_ts := make_timestamptz(
    extract(year FROM effective_end_date)::integer,
    extract(month FROM effective_end_date)::integer,
    extract(day FROM effective_end_date)::integer,
    COALESCE(extract(hour FROM p_end_time)::integer, 23),
    COALESCE(extract(minute FROM p_end_time)::integer, 59),
    CASE WHEN p_end_time IS NULL THEN 59 ELSE 0 END,
    'UTC'
  );

  IF current_ts >= start_ts AND current_ts <= end_ts THEN
    RETURN 'in_progress';
  ELSIF current_ts > end_ts THEN
    RETURN CASE WHEN p_caregiver_member_id IS NULL THEN 'missed' ELSE 'completed' END;
  ELSIF p_caregiver_member_id IS NULL THEN
    RETURN 'unassigned';
  END IF;
  RETURN 'scheduled';
END
$function$;

-- Compatibility overload for existing application callers.
CREATE FUNCTION public.compute_scheduled_visit_status(
  p_visit_date date,
  p_start_time time,
  p_end_time time,
  p_caregiver_member_id uuid
) RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT public.compute_scheduled_visit_status(
    p_visit_date, p_start_time, p_end_time, NULL, p_caregiver_member_id
  )
$function$;

CREATE FUNCTION public.sync_scheduled_visit_statuses(
  p_agency_id uuid DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_visit_ids uuid[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  changed_count integer;
BEGIN
  WITH changed AS (
    UPDATE public.scheduled_visits visit
    SET status = public.compute_scheduled_visit_status(
          visit.visit_date,
          visit.scheduled_start_time,
          visit.scheduled_end_time,
          visit.scheduled_end_date,
          visit.caregiver_member_id
        ),
        updated_at = clock_timestamp()
    WHERE visit.status NOT IN ('completed', 'missed', 'cancelled', 'voided')
      AND (p_agency_id IS NULL OR visit.agency_id = p_agency_id)
      AND (p_patient_id IS NULL OR visit.patient_id = p_patient_id)
      AND (p_visit_ids IS NULL OR visit.id = ANY(p_visit_ids))
      AND visit.status IS DISTINCT FROM public.compute_scheduled_visit_status(
        visit.visit_date,
        visit.scheduled_start_time,
        visit.scheduled_end_time,
        visit.scheduled_end_date,
        visit.caregiver_member_id
      )
    RETURNING 1
  )
  SELECT count(*)::integer INTO changed_count FROM changed;
  RETURN changed_count;
END
$function$;

CREATE FUNCTION public.scheduled_visits_set_status_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IN ('completed', 'missed', 'cancelled', 'voided') THEN
    RETURN NEW;
  END IF;
  NEW.status := public.compute_scheduled_visit_status(
    NEW.visit_date,
    NEW.scheduled_start_time,
    NEW.scheduled_end_time,
    NEW.scheduled_end_date,
    NEW.caregiver_member_id
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS scheduled_visits_status_before_write ON public.scheduled_visits;
CREATE TRIGGER scheduled_visits_status_before_write
BEFORE INSERT OR UPDATE OF visit_date, scheduled_start_time, scheduled_end_time,
  scheduled_end_date, caregiver_member_id
ON public.scheduled_visits
FOR EACH ROW
EXECUTE FUNCTION public.scheduled_visits_set_status_before_write();

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
REVOKE ALL ON FUNCTION public.sync_scheduled_visit_statuses(uuid,uuid,uuid[]) FROM PUBLIC, mycaresight_app;
REVOKE ALL ON FUNCTION public.scheduled_visits_set_status_before_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_scheduled_visit_status(date,time,time,date,uuid)
  TO mycaresight_app, mycaresight_jobs;
GRANT EXECUTE ON FUNCTION public.compute_scheduled_visit_status(date,time,time,uuid)
  TO mycaresight_app, mycaresight_jobs;
GRANT EXECUTE ON FUNCTION public.sync_scheduled_visit_statuses(uuid,uuid,uuid[])
  TO mycaresight_jobs;

COMMENT ON TABLE public.background_job_runs IS
  'Sanitized invocation audit; never store PHI, email addresses, names, notes, or message content.';
COMMENT ON TABLE public.background_job_items IS
  'Idempotent work ledger using opaque record identifiers only; content must be loaded under job-role authorization.';
COMMENT ON TABLE public.background_job_outbox IS
  'Transactional queue handoff; Azure messages contain only this opaque outbox row identifier.';

COMMIT;
