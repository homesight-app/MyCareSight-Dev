-- 011a: harden the old-row predicates from the initial 011 draft.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '011a must not run against Supabase'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
     OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
    RAISE EXCEPTION '011a requires independent migration owner and restricted runtime role';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_approvals'
      AND policyname='visit_approvals_manager_update' AND cmd='UPDATE')
     OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_financials'
      AND policyname='visit_financials_manager_update' AND cmd='UPDATE') THEN
    RAISE EXCEPTION '011a requires the 011 manager update policies';
  END IF;
END $preflight$;

DROP POLICY visit_approvals_manager_update ON public.visit_approvals;
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

DROP POLICY visit_financials_manager_update ON public.visit_financials;
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

COMMIT;
