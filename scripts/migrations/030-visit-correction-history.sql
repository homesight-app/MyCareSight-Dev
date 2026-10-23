-- 030: Append-only, agency-scoped history for administrator visit corrections.
-- Apply manually to Neon Development first, then UAT. No production data movement.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '030 must not run against Supabase';
  END IF;
  IF to_regclass('public.visit_corrections') IS NOT NULL THEN
    RAISE EXCEPTION '030 already applied';
  END IF;
  IF to_regprocedure('public.visit_financial_manager_can_read(uuid)') IS NULL THEN
    RAISE EXCEPTION '030 requires verified manager financial access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION '030 requires the restricted mycaresight_app role';
  END IF;
END
$preflight$;

CREATE TABLE public.visit_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  scheduled_visit_id uuid NOT NULL REFERENCES public.scheduled_visits(id),
  corrected_by_user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  previous_status text NOT NULL,
  corrected_status text NOT NULL,
  reason text NOT NULL,
  previous_caregiver_member_id uuid REFERENCES public.caregiver_members(id),
  corrected_caregiver_member_id uuid REFERENCES public.caregiver_members(id),
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  actual_hours numeric(8,2),
  billable_hours numeric(8,2),
  previous_financial_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_corrections_transition_check CHECK (
    (previous_status = 'missed' AND corrected_status = 'completed') OR
    (previous_status = 'completed' AND corrected_status = 'missed')
  ),
  CONSTRAINT visit_corrections_reason_check CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  CONSTRAINT visit_corrections_times_check CHECK (
    corrected_status = 'missed' OR
    (actual_start_time IS NOT NULL AND actual_end_time > actual_start_time
      AND actual_hours IS NOT NULL AND actual_hours > 0
      AND billable_hours IS NOT NULL AND billable_hours >= 0)
  )
);

CREATE INDEX visit_corrections_agency_visit_created_idx
  ON public.visit_corrections(agency_id, scheduled_visit_id, created_at DESC);

ALTER TABLE public.visit_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_corrections FORCE ROW LEVEL SECURITY;

CREATE POLICY visit_corrections_owner_read ON public.visit_corrections
  FOR SELECT TO mycaresight_app USING (
    public.visit_financial_manager_can_read(agency_id)
    AND current_setting('app.current_user_role', true) = 'company_owner'
    AND EXISTS (
      SELECT 1 FROM public.scheduled_visits visit
      WHERE visit.id = scheduled_visit_id AND visit.agency_id = visit_corrections.agency_id
    )
  );

CREATE POLICY visit_corrections_owner_insert ON public.visit_corrections
  FOR INSERT TO mycaresight_app WITH CHECK (
    public.visit_financial_manager_can_read(agency_id)
    AND current_setting('app.current_user_role', true) = 'company_owner'
    AND corrected_by_user_id::text = NULLIF(current_setting('app.current_user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM public.scheduled_visits visit
      WHERE visit.id = scheduled_visit_id AND visit.agency_id = visit_corrections.agency_id
    )
  );

REVOKE ALL ON public.visit_corrections FROM PUBLIC, mycaresight_app;
GRANT SELECT, INSERT ON public.visit_corrections TO mycaresight_app;

DO $verify$
BEGIN
  IF NOT has_table_privilege('mycaresight_app', 'public.visit_corrections', 'SELECT')
    OR NOT has_table_privilege('mycaresight_app', 'public.visit_corrections', 'INSERT')
    OR has_table_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE,REFERENCES') THEN
    RAISE EXCEPTION '030 did not establish append-only runtime privileges';
  END IF;
END
$verify$;

COMMENT ON TABLE public.visit_corrections IS
  'Append-only manual visit correction history. Reason and actual times are sensitive; never copy into generic audit details.';

COMMIT;
