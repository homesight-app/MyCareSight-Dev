-- 011: atomic agency-manager approval and void writes. Manual Dev first, then unused UAT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
DECLARE t text;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '011 must not run against Supabase'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
     OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
    RAISE EXCEPTION '011 requires independent migration owner and restricted runtime role';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_time_entries'
    AND policyname='visit_time_entries_caregiver_update')
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.visit_time_entries'::regclass
      AND tgname='visit_time_entries_sync_financial_on_clock_out' AND tgenabled='O') THEN
    RAISE EXCEPTION '011 requires verified 010 caregiver execution access';
  END IF;
  FOREACH t IN ARRAY ARRAY['visit_time_entries','visit_approvals','visit_financials','visit_adjustment_history'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t) AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION '011 requires forced RLS on %',t;
    END IF;
  END LOOP;
  IF to_regclass('public.audit_log') IS NULL
     OR NOT has_column_privilege('mycaresight_app','public.audit_log','agency_id','INSERT') THEN
    RAISE EXCEPTION '011 requires runtime audit_log INSERT access';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND policyname IN ('visit_time_entries_manager_insert','visit_time_entries_manager_update',
      'visit_approvals_manager_insert','visit_approvals_manager_update','visit_financials_manager_insert',
      'visit_financials_manager_update','visit_adjustment_history_manager_insert')) THEN
    RAISE EXCEPTION '011 manager write policies already exist';
  END IF;
END $preflight$;

CREATE POLICY visit_time_entries_manager_insert ON public.visit_time_entries
FOR INSERT TO mycaresight_app WITH CHECK (
  public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.scheduled_visits visit WHERE visit.id=scheduled_visit_id
    AND visit.agency_id=visit_time_entries.agency_id AND visit.patient_id=visit_time_entries.patient_id
    AND visit.caregiver_member_id=visit_time_entries.caregiver_member_id)
);
CREATE POLICY visit_time_entries_manager_update ON public.visit_time_entries
FOR UPDATE TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.scheduled_visits visit WHERE visit.id=scheduled_visit_id
    AND visit.agency_id=visit_time_entries.agency_id AND visit.patient_id=visit_time_entries.patient_id
    AND visit.caregiver_member_id=visit_time_entries.caregiver_member_id))
WITH CHECK (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.scheduled_visits visit WHERE visit.id=scheduled_visit_id
    AND visit.agency_id=visit_time_entries.agency_id AND visit.patient_id=visit_time_entries.patient_id
    AND visit.caregiver_member_id=visit_time_entries.caregiver_member_id));

CREATE POLICY visit_approvals_manager_insert ON public.visit_approvals
FOR INSERT TO mycaresight_app WITH CHECK (
  public.visit_financial_manager_can_read(agency_id)
  AND approved_by_user_id::text=NULLIF(current_setting('app.current_user_id',true),'')
  AND EXISTS(SELECT 1 FROM public.visit_time_entries entry WHERE entry.id=visit_time_entry_id
    AND entry.agency_id=visit_approvals.agency_id AND entry.scheduled_visit_id=visit_approvals.scheduled_visit_id
    AND entry.patient_id=visit_approvals.patient_id AND entry.caregiver_member_id=visit_approvals.caregiver_member_id)
);
CREATE POLICY visit_approvals_manager_update ON public.visit_approvals
FOR UPDATE TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.visit_time_entries entry WHERE entry.id=visit_time_entry_id
    AND entry.agency_id=visit_approvals.agency_id AND entry.scheduled_visit_id=visit_approvals.scheduled_visit_id
    AND entry.patient_id=visit_approvals.patient_id AND entry.caregiver_member_id=visit_approvals.caregiver_member_id))
WITH CHECK (public.visit_financial_manager_can_read(agency_id)
  AND approved_by_user_id::text=NULLIF(current_setting('app.current_user_id',true),'')
  AND EXISTS(SELECT 1 FROM public.visit_time_entries entry WHERE entry.id=visit_time_entry_id
    AND entry.agency_id=visit_approvals.agency_id AND entry.scheduled_visit_id=visit_approvals.scheduled_visit_id
    AND entry.patient_id=visit_approvals.patient_id AND entry.caregiver_member_id=visit_approvals.caregiver_member_id));

CREATE POLICY visit_financials_manager_insert ON public.visit_financials
FOR INSERT TO mycaresight_app WITH CHECK (
  public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.visit_time_entries entry WHERE entry.id=visit_time_entry_id
    AND entry.agency_id=visit_financials.agency_id AND entry.scheduled_visit_id=visit_financials.scheduled_visit_id
    AND entry.patient_id=visit_financials.patient_id AND entry.caregiver_member_id=visit_financials.caregiver_member_id)
  AND (visit_approval_id IS NULL OR EXISTS(SELECT 1 FROM public.visit_approvals approval
    WHERE approval.id=visit_approval_id AND approval.agency_id=visit_financials.agency_id
      AND approval.visit_time_entry_id=visit_financials.visit_time_entry_id))
);
CREATE POLICY visit_financials_manager_update ON public.visit_financials
FOR UPDATE TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.visit_time_entries entry WHERE entry.id=visit_time_entry_id
    AND entry.agency_id=visit_financials.agency_id AND entry.scheduled_visit_id=visit_financials.scheduled_visit_id
    AND entry.patient_id=visit_financials.patient_id AND entry.caregiver_member_id=visit_financials.caregiver_member_id)
  AND (visit_approval_id IS NULL OR EXISTS(SELECT 1 FROM public.visit_approvals approval
    WHERE approval.id=visit_approval_id AND approval.agency_id=visit_financials.agency_id
      AND approval.visit_time_entry_id=visit_financials.visit_time_entry_id)))
WITH CHECK (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.visit_time_entries entry WHERE entry.id=visit_time_entry_id
    AND entry.agency_id=visit_financials.agency_id AND entry.scheduled_visit_id=visit_financials.scheduled_visit_id
    AND entry.patient_id=visit_financials.patient_id AND entry.caregiver_member_id=visit_financials.caregiver_member_id)
  AND (visit_approval_id IS NULL OR EXISTS(SELECT 1 FROM public.visit_approvals approval
    WHERE approval.id=visit_approval_id AND approval.agency_id=visit_financials.agency_id
      AND approval.visit_time_entry_id=visit_financials.visit_time_entry_id)));

CREATE POLICY visit_adjustment_history_manager_insert ON public.visit_adjustment_history
FOR INSERT TO mycaresight_app WITH CHECK (
  public.visit_financial_manager_can_read(agency_id)
  AND changed_by_user_id::text=NULLIF(current_setting('app.current_user_id',true),'')
  AND EXISTS(SELECT 1 FROM public.visit_time_entries entry
    WHERE entry.id=visit_time_entry_id AND entry.agency_id=visit_adjustment_history.agency_id)
);

GRANT INSERT (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,entry_status)
  ON public.visit_time_entries TO mycaresight_app;
GRANT UPDATE (actual_hours,billable_hours,entry_status,adjustment_comment,updated_at)
  ON public.visit_time_entries TO mycaresight_app;
GRANT INSERT (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,
  approved_by_user_id,approval_status,approved_actual_hours,approved_billable_hours,approval_comment,
  pay_rate,bill_rate,approved_at) ON public.visit_approvals TO mycaresight_app;
GRANT UPDATE (approved_by_user_id,approval_status,approved_actual_hours,approved_billable_hours,
  approval_comment,pay_rate,bill_rate,approved_at,updated_at) ON public.visit_approvals TO mycaresight_app;
GRANT INSERT (agency_id,scheduled_visit_id,visit_time_entry_id,visit_approval_id,patient_id,
  caregiver_member_id,contract_id,billing_code_id,pay_rate,pay_unit_type,pay_amount,bill_rate,
  bill_unit_type,bill_amount,approved_actual_hours,approved_billable_hours,calculation_basis,
  service_type,status,coordinator_note) ON public.visit_financials TO mycaresight_app;
GRANT UPDATE (visit_approval_id,contract_id,billing_code_id,pay_rate,pay_unit_type,pay_amount,
  bill_rate,bill_unit_type,bill_amount,approved_actual_hours,approved_billable_hours,
  calculation_basis,service_type,status,coordinator_note,updated_at) ON public.visit_financials TO mycaresight_app;
GRANT INSERT (agency_id,visit_time_entry_id,changed_by_user_id,reason,previous_actual_hours,
  current_actual_hours,previous_billable_hours,current_billable_hours,note)
  ON public.visit_adjustment_history TO mycaresight_app;

COMMIT;
