-- 010: assigned-caregiver visit execution. Manual Dev first, then unused UAT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '010 must not run against Supabase'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
     OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
    RAISE EXCEPTION '010 requires independent migration owner and restricted runtime role';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls) THEN
    RAISE EXCEPTION '010 financial trigger owner must have BYPASSRLS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_time_entries'
    AND policyname='visit_time_entries_manager_select' AND cmd='SELECT' AND roles=ARRAY['mycaresight_app']::name[]) THEN
    RAISE EXCEPTION '010 requires verified 009 manager access';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('visit_time_entries','visit_financials')
    AND policyname LIKE '%caregiver%') THEN
    RAISE EXCEPTION '010 caregiver policies already exist';
  END IF;
  IF to_regclass('public.scheduled_visits') IS NULL OR to_regclass('public.scheduled_visit_tasks') IS NULL
     OR to_regclass('public.caregiver_members') IS NULL OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '010 missing visit, caregiver, or audit dependencies';
  END IF;
  IF NOT has_table_privilege('mycaresight_app','public.audit_log','INSERT') THEN
    RAISE EXCEPTION '010 requires runtime audit INSERT';
  END IF;
END $preflight$;

CREATE FUNCTION public.caregiver_can_execute_visit(target_agency uuid,target_caregiver uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.user_profiles profile
    JOIN public.user_agency_roles membership
      ON membership.user_id=profile.id AND membership.agency_id=target_agency
     AND membership.role=profile.role AND membership.status='active'
    JOIN public.caregiver_members member
      ON member.id=target_caregiver AND member.user_id=profile.id
     AND member.agency_id=target_agency AND member.status='active'
    WHERE profile.id::text=NULLIF(current_setting('app.current_user_id',true),'')
      AND profile.is_active=true AND profile.role='staff_member'
  )
$$;
REVOKE ALL ON FUNCTION public.caregiver_can_execute_visit(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caregiver_can_execute_visit(uuid,uuid) TO mycaresight_app;

CREATE POLICY visit_time_entries_caregiver_select ON public.visit_time_entries
FOR SELECT TO mycaresight_app USING (
  public.caregiver_can_execute_visit(agency_id,caregiver_member_id)
  AND EXISTS(SELECT 1 FROM public.scheduled_visits visit
    WHERE visit.id=scheduled_visit_id AND visit.agency_id=visit_time_entries.agency_id
      AND visit.patient_id=visit_time_entries.patient_id
      AND visit.caregiver_member_id=visit_time_entries.caregiver_member_id)
);

CREATE POLICY visit_time_entries_caregiver_insert ON public.visit_time_entries
FOR INSERT TO mycaresight_app WITH CHECK (
  entry_status='pending_review' AND clock_out_time IS NULL AND actual_hours IS NULL AND billable_hours IS NULL
  AND public.caregiver_can_execute_visit(agency_id,caregiver_member_id)
  AND EXISTS(SELECT 1 FROM public.scheduled_visits visit
    WHERE visit.id=scheduled_visit_id AND visit.agency_id=visit_time_entries.agency_id
      AND visit.patient_id=visit_time_entries.patient_id
      AND visit.caregiver_member_id=visit_time_entries.caregiver_member_id)
);

CREATE POLICY visit_time_entries_caregiver_update ON public.visit_time_entries
FOR UPDATE TO mycaresight_app
USING (
  public.caregiver_can_execute_visit(agency_id,caregiver_member_id)
  AND EXISTS(SELECT 1 FROM public.scheduled_visits visit
    WHERE visit.id=scheduled_visit_id AND visit.agency_id=visit_time_entries.agency_id
      AND visit.patient_id=visit_time_entries.patient_id
      AND visit.caregiver_member_id=visit_time_entries.caregiver_member_id)
)
WITH CHECK (
  public.caregiver_can_execute_visit(agency_id,caregiver_member_id)
  AND EXISTS(SELECT 1 FROM public.scheduled_visits visit
    WHERE visit.id=scheduled_visit_id AND visit.agency_id=visit_time_entries.agency_id
      AND visit.patient_id=visit_time_entries.patient_id
      AND visit.caregiver_member_id=visit_time_entries.caregiver_member_id)
);

GRANT INSERT (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,clock_in_time,
  clock_in_latitude,clock_in_longitude,entry_status)
  ON public.visit_time_entries TO mycaresight_app;
GRANT UPDATE (clock_in_time,clock_in_latitude,clock_in_longitude,clock_out_time,clock_out_latitude,
  clock_out_longitude,actual_hours,billable_hours,caregiver_notes,updated_at)
  ON public.visit_time_entries TO mycaresight_app;

-- Task definitions remain manager-created. Caregivers can only change completion fields through
-- the authorized server repository; remove the existing table-wide UPDATE grant.
REVOKE UPDATE ON public.scheduled_visit_tasks FROM mycaresight_app;
GRANT UPDATE (completed_at,updated_at) ON public.scheduled_visit_tasks TO mycaresight_app;

CREATE FUNCTION public.sync_visit_financial_on_clock_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE visit_row public.scheduled_visits%ROWTYPE;
BEGIN
  IF OLD.clock_out_time IS NOT NULL OR NEW.clock_out_time IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO STRICT visit_row FROM public.scheduled_visits
    WHERE id=NEW.scheduled_visit_id AND agency_id=NEW.agency_id
      AND patient_id=NEW.patient_id AND caregiver_member_id=NEW.caregiver_member_id;
  INSERT INTO public.visit_financials
    (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,
     service_type,status,approved_actual_hours,approved_billable_hours,calculation_basis)
  VALUES (NEW.agency_id,NEW.scheduled_visit_id,NEW.id,NEW.patient_id,NEW.caregiver_member_id,
    coalesce(visit_row.service_type,'non_skilled'),'pending',NEW.actual_hours,NEW.billable_hours,
    jsonb_build_object('created_on_clock_out',true,'at',now()))
  ON CONFLICT (scheduled_visit_id) DO UPDATE SET
    visit_time_entry_id=EXCLUDED.visit_time_entry_id,
    patient_id=EXCLUDED.patient_id,
    caregiver_member_id=EXCLUDED.caregiver_member_id,
    service_type=coalesce(public.visit_financials.service_type,EXCLUDED.service_type),
    status=CASE WHEN public.visit_financials.status='approved' THEN public.visit_financials.status ELSE 'pending' END,
    approved_actual_hours=coalesce(public.visit_financials.approved_actual_hours,EXCLUDED.approved_actual_hours),
    approved_billable_hours=coalesce(public.visit_financials.approved_billable_hours,EXCLUDED.approved_billable_hours),
    updated_at=now();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.sync_visit_financial_on_clock_out() FROM PUBLIC;
DROP TRIGGER IF EXISTS visit_time_entries_sync_financial_on_clock_out ON public.visit_time_entries;
CREATE TRIGGER visit_time_entries_sync_financial_on_clock_out
AFTER UPDATE OF clock_out_time ON public.visit_time_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_visit_financial_on_clock_out();

COMMIT;
