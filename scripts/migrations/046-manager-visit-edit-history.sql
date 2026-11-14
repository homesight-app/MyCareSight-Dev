-- Extend the append-only correction history for single-visit manager edits.
-- The migration runner owns the transaction and ledger insert.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $migration$
BEGIN
  IF to_regclass('public.visit_corrections') IS NULL
     OR to_regclass('public.visit_time_entries') IS NULL
     OR to_regclass('public.internal_notes') IS NULL
     OR to_regprocedure('public.caregiver_can_execute_visit(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '046 requires visit correction, time entry, and internal note foundations';
  END IF;
END
$migration$;

ALTER TABLE public.scheduled_visits
  ADD COLUMN IF NOT EXISTS visit_timezone text;

ALTER TABLE public.scheduled_visits
  DROP CONSTRAINT IF EXISTS scheduled_visits_visit_timezone_check;

ALTER TABLE public.scheduled_visits
  ADD CONSTRAINT scheduled_visits_visit_timezone_check CHECK (
    visit_timezone IS NULL OR visit_timezone IN (
      'America/New_York','America/Chicago','America/Denver','America/Phoenix',
      'America/Los_Angeles','America/Anchorage','Pacific/Honolulu'
    )
  );

COMMENT ON COLUMN public.scheduled_visits.visit_timezone IS
  'IANA time zone for the visit location; used for manager-entered wall-clock time.';

ALTER TABLE public.visit_corrections
  ADD COLUMN IF NOT EXISTS change_type text NOT NULL DEFAULT 'status_correction',
  ADD COLUMN IF NOT EXISTS care_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_visit_date date,
  ADD COLUMN IF NOT EXISTS corrected_visit_date date,
  ADD COLUMN IF NOT EXISTS previous_scheduled_start_time time,
  ADD COLUMN IF NOT EXISTS corrected_scheduled_start_time time,
  ADD COLUMN IF NOT EXISTS previous_scheduled_end_date date,
  ADD COLUMN IF NOT EXISTS corrected_scheduled_end_date date,
  ADD COLUMN IF NOT EXISTS previous_scheduled_end_time time,
  ADD COLUMN IF NOT EXISTS corrected_scheduled_end_time time,
  ADD COLUMN IF NOT EXISTS previous_actual_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS previous_actual_end_time timestamptz;

ALTER TABLE public.visit_adjustment_history
  ADD COLUMN IF NOT EXISTS previous_pay_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS current_pay_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS previous_bill_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS current_bill_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS previous_pay_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS current_pay_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS previous_bill_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS current_bill_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS previous_financial_status text,
  ADD COLUMN IF NOT EXISTS current_financial_status text;

ALTER TABLE public.visit_corrections
  DROP CONSTRAINT IF EXISTS visit_corrections_transition_check,
  DROP CONSTRAINT IF EXISTS visit_corrections_times_check,
  DROP CONSTRAINT IF EXISTS visit_corrections_change_type_check,
  DROP CONSTRAINT IF EXISTS visit_corrections_care_verified_check;

ALTER TABLE public.visit_corrections
  ADD CONSTRAINT visit_corrections_change_type_check CHECK (
    change_type IN ('status_correction', 'manager_visit_edit', 'manager_manual_time')
  ),
  ADD CONSTRAINT visit_corrections_transition_check CHECK (
    (change_type = 'status_correction' AND (
      (previous_status = 'missed' AND corrected_status = 'completed') OR
      (previous_status = 'completed' AND corrected_status = 'missed')
    )) OR
    (change_type IN ('manager_visit_edit', 'manager_manual_time')
      AND previous_status IN ('scheduled','unassigned','in_progress','completed','missed','on_hold')
      AND corrected_status IN ('scheduled','unassigned','in_progress','completed','missed','on_hold'))
  ),
  ADD CONSTRAINT visit_corrections_times_check CHECK (
    (actual_start_time IS NULL AND actual_end_time IS NULL
      AND actual_hours IS NULL AND billable_hours IS NULL) OR
    (actual_start_time IS NOT NULL AND actual_end_time IS NULL
      AND actual_hours IS NULL AND billable_hours IS NULL
      AND corrected_status = 'in_progress') OR
    (actual_start_time IS NOT NULL AND actual_end_time > actual_start_time
      AND actual_hours IS NOT NULL AND actual_hours > 0
      AND billable_hours IS NOT NULL AND billable_hours >= 0
      AND corrected_status = 'completed')
  ),
  ADD CONSTRAINT visit_corrections_care_verified_check CHECK (
    change_type <> 'manager_manual_time' OR care_verified = true
  );

COMMENT ON COLUMN public.visit_corrections.change_type IS
  'Classifies immutable single-visit status, schedule, assignment, and manager-entered time changes.';

COMMENT ON COLUMN public.visit_corrections.care_verified IS
  'Records the manager attestation required for manually entered or adjusted visit time.';

COMMENT ON COLUMN public.visit_adjustment_history.previous_financial_status IS
  'Append-only financial decision snapshot; protected as sensitive operational and billing evidence.';

-- Caregivers and managers share the restricted runtime role. Column grants therefore cannot
-- distinguish caregiver-originated clock evidence from manager adjustments. Enforce that
-- distinction with actor context while allowing managers to write only the adjusted fields.
CREATE OR REPLACE FUNCTION public.protect_visit_time_entry_caregiver_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  raw_evidence_changed boolean;
BEGIN
  raw_evidence_changed := CASE WHEN TG_OP = 'INSERT' THEN
    NEW.clock_in_time IS NOT NULL OR NEW.clock_out_time IS NOT NULL
      OR NEW.clock_in_latitude IS NOT NULL OR NEW.clock_in_longitude IS NOT NULL
      OR NEW.clock_out_latitude IS NOT NULL OR NEW.clock_out_longitude IS NOT NULL
  ELSE
    NEW.clock_in_time IS DISTINCT FROM OLD.clock_in_time
      OR NEW.clock_out_time IS DISTINCT FROM OLD.clock_out_time
      OR NEW.clock_in_latitude IS DISTINCT FROM OLD.clock_in_latitude
      OR NEW.clock_in_longitude IS DISTINCT FROM OLD.clock_in_longitude
      OR NEW.clock_out_latitude IS DISTINCT FROM OLD.clock_out_latitude
      OR NEW.clock_out_longitude IS DISTINCT FROM OLD.clock_out_longitude
  END;

  IF raw_evidence_changed
     AND NOT public.caregiver_can_execute_visit(NEW.agency_id, NEW.caregiver_member_id) THEN
    RAISE EXCEPTION 'Caregiver clock evidence can only be recorded by the assigned caregiver'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.protect_visit_time_entry_caregiver_evidence() FROM PUBLIC;

DROP TRIGGER IF EXISTS visit_time_entries_protect_caregiver_evidence
  ON public.visit_time_entries;
CREATE TRIGGER visit_time_entries_protect_caregiver_evidence
BEFORE INSERT OR UPDATE ON public.visit_time_entries
FOR EACH ROW EXECUTE FUNCTION public.protect_visit_time_entry_caregiver_evidence();

-- Migration 010 and 011 intentionally use column-level least-privilege grants. Raw clock
-- columns remain available to caregivers and are actor-protected by the trigger above.
GRANT UPDATE (visit_timezone) ON public.scheduled_visits TO mycaresight_app;
GRANT INSERT (adjusted_start_time, adjusted_end_time, actual_hours, billable_hours, adjustment_comment)
  ON public.visit_time_entries TO mycaresight_app;
GRANT UPDATE (adjusted_start_time, adjusted_end_time)
  ON public.visit_time_entries TO mycaresight_app;
GRANT INSERT (previous_pay_rate, current_pay_rate, previous_bill_rate, current_bill_rate,
  previous_pay_amount, current_pay_amount, previous_bill_amount, current_bill_amount,
  previous_financial_status, current_financial_status)
  ON public.visit_adjustment_history TO mycaresight_app;

