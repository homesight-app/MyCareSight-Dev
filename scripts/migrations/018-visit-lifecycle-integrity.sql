-- 018: Keep scheduled-visit execution state tied to explicit caregiver/manager actions.
-- The background job may normalize assignment state and mark an unstaffed past
-- visit missed, but it must never manufacture in-progress/completed care.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('public.scheduled_visits') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite table: public.scheduled_visits';
  END IF;
  IF to_regprocedure(
    'public.compute_scheduled_visit_status(date,time without time zone,time without time zone,date,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Run migration 016 before migration 018';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.compute_scheduled_visit_status(
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
  end_ts timestamptz;
  effective_end_date date := COALESCE(p_scheduled_end_date, p_visit_date);
BEGIN
  IF p_visit_date IS NULL THEN
    RAISE EXCEPTION 'visit date is required';
  END IF;

  -- Assignment state is safe to infer. Care execution is not: in_progress and
  -- completed are set only by explicit clock-in/clock-out or manager actions.
  IF p_caregiver_member_id IS NOT NULL THEN
    RETURN 'scheduled';
  END IF;

  end_ts := make_timestamptz(
    extract(year FROM effective_end_date)::integer,
    extract(month FROM effective_end_date)::integer,
    extract(day FROM effective_end_date)::integer,
    COALESCE(extract(hour FROM p_end_time)::integer, 23),
    COALESCE(extract(minute FROM p_end_time)::integer, 59),
    CASE WHEN p_end_time IS NULL THEN 59 ELSE 0 END,
    'UTC'
  );

  IF now() > end_ts THEN
    RETURN 'missed';
  END IF;
  RETURN 'unassigned';
END
$function$;

CREATE OR REPLACE FUNCTION public.compute_scheduled_visit_status(
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

CREATE OR REPLACE FUNCTION public.sync_scheduled_visit_statuses(
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
    WHERE COALESCE(visit.status, '') IN ('', 'scheduled', 'unassigned')
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

CREATE OR REPLACE FUNCTION public.scheduled_visits_set_status_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Never replace an explicit execution, hold, or terminal decision merely
  -- because a schedule field changed.
  IF TG_OP = 'UPDATE' AND NEW.status IN (
    'in_progress', 'completed', 'missed', 'cancelled', 'voided', 'on_hold'
  ) THEN
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

DROP INDEX IF EXISTS public.scheduled_visits_status_sync_idx;
CREATE INDEX scheduled_visits_status_sync_idx
  ON public.scheduled_visits(visit_date, scheduled_end_date, id)
  INCLUDE (scheduled_start_time, scheduled_end_time, caregiver_member_id, status)
  WHERE status IN ('scheduled', 'unassigned');

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

COMMENT ON FUNCTION public.compute_scheduled_visit_status(date,time,time,date,uuid) IS
  'Normalizes assignment state and unstaffed missed visits; never infers care execution from wall-clock time.';

COMMIT;
