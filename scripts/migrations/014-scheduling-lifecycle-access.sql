-- 014: manager scheduling lifecycle and assigned/open caregiver reads. Manual Dev first, then unused UAT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
DECLARE t text;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '014 must not run against Supabase'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
     OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
    RAISE EXCEPTION '014 requires independent migration owner and restricted runtime role';
  END IF;
  IF to_regprocedure('public.visit_financial_manager_can_read(uuid)') IS NULL
     OR to_regprocedure('public.caregiver_can_execute_visit(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '014 requires verified 009 and 010 actor helpers';
  END IF;
  FOREACH t IN ARRAY ARRAY['scheduled_visits','scheduled_visit_tasks','visit_series'] LOOP
    IF to_regclass('public.'||t) IS NULL
       OR EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t) AND (relrowsecurity OR relforcerowsecurity))
       OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t) THEN
      RAISE EXCEPTION '014 requires unstaged scheduling table: %',t;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('mycaresight_app','public.scheduled_visits','SELECT,INSERT,UPDATE,DELETE')
     OR NOT has_table_privilege('mycaresight_app','public.scheduled_visit_tasks','SELECT,INSERT,DELETE')
     OR NOT has_table_privilege('mycaresight_app','public.visit_series','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION '014 expected legacy broad scheduling grants before replacement';
  END IF;
END $preflight$;

CREATE FUNCTION public.scheduling_caregiver_can_read(target_agency uuid,target_caregiver uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_profiles profile
    JOIN public.user_agency_roles membership ON membership.user_id=profile.id
      AND membership.agency_id=target_agency AND membership.role=profile.role AND membership.status='active'
    JOIN public.caregiver_members member ON member.user_id=profile.id AND member.agency_id=target_agency
      AND member.status='active' AND (target_caregiver IS NULL OR member.id=target_caregiver)
    WHERE profile.id::text=NULLIF(current_setting('app.current_user_id',true),'')
      AND profile.is_active=true AND profile.role='staff_member')
$$;
REVOKE ALL ON FUNCTION public.scheduling_caregiver_can_read(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scheduling_caregiver_can_read(uuid,uuid) TO mycaresight_app;

CREATE INDEX scheduled_visits_agency_date_idx ON public.scheduled_visits(agency_id,visit_date,scheduled_start_time,id);
CREATE INDEX scheduled_visits_caregiver_date_idx ON public.scheduled_visits(agency_id,caregiver_member_id,visit_date,id);
CREATE INDEX scheduled_visit_tasks_visit_sort_idx ON public.scheduled_visit_tasks(scheduled_visit_id,sort_order,id);
CREATE INDEX visit_series_agency_patient_idx ON public.visit_series(agency_id,patient_id,id);

ALTER TABLE public.scheduled_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_visits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_visit_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_visit_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.visit_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_series FORCE ROW LEVEL SECURITY;

CREATE POLICY scheduled_visits_manager_select ON public.scheduled_visits FOR SELECT TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id));
CREATE POLICY scheduled_visits_caregiver_select ON public.scheduled_visits FOR SELECT TO mycaresight_app
USING (public.scheduling_caregiver_can_read(agency_id,caregiver_member_id));
CREATE POLICY scheduled_visits_manager_insert ON public.scheduled_visits FOR INSERT TO mycaresight_app WITH CHECK (
  public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients p WHERE p.id=patient_id AND p.agency_id=scheduled_visits.agency_id)
  AND (caregiver_member_id IS NULL OR EXISTS(SELECT 1 FROM public.caregiver_members c WHERE c.id=caregiver_member_id AND c.agency_id=scheduled_visits.agency_id))
  AND (contract_id IS NULL OR EXISTS(SELECT 1 FROM public.patient_service_contracts c WHERE c.id=contract_id AND c.agency_id=scheduled_visits.agency_id AND c.patient_id=scheduled_visits.patient_id))
  AND (patient_address_id IS NULL OR EXISTS(SELECT 1 FROM public.patient_addresses a WHERE a.id=patient_address_id AND a.agency_id=scheduled_visits.agency_id AND a.patient_id=scheduled_visits.patient_id))
  AND (visit_series_id IS NULL OR EXISTS(SELECT 1 FROM public.visit_series s WHERE s.id=visit_series_id AND s.agency_id=scheduled_visits.agency_id AND s.patient_id=scheduled_visits.patient_id))
);
CREATE POLICY scheduled_visits_manager_update ON public.scheduled_visits FOR UPDATE TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id))
WITH CHECK (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients p WHERE p.id=patient_id AND p.agency_id=scheduled_visits.agency_id)
  AND (caregiver_member_id IS NULL OR EXISTS(SELECT 1 FROM public.caregiver_members c WHERE c.id=caregiver_member_id AND c.agency_id=scheduled_visits.agency_id))
  AND (contract_id IS NULL OR EXISTS(SELECT 1 FROM public.patient_service_contracts c WHERE c.id=contract_id AND c.agency_id=scheduled_visits.agency_id AND c.patient_id=scheduled_visits.patient_id))
);
CREATE POLICY scheduled_visits_manager_delete ON public.scheduled_visits FOR DELETE TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id));

CREATE POLICY scheduled_visit_tasks_manager_select ON public.scheduled_visit_tasks FOR SELECT TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id) AND EXISTS(SELECT 1 FROM public.scheduled_visits v
  WHERE v.id=scheduled_visit_id AND v.agency_id=scheduled_visit_tasks.agency_id));
CREATE POLICY scheduled_visit_tasks_caregiver_select ON public.scheduled_visit_tasks FOR SELECT TO mycaresight_app
USING (EXISTS(SELECT 1 FROM public.scheduled_visits v WHERE v.id=scheduled_visit_id
  AND v.agency_id=scheduled_visit_tasks.agency_id AND public.scheduling_caregiver_can_read(v.agency_id,v.caregiver_member_id)));
CREATE POLICY scheduled_visit_tasks_manager_insert ON public.scheduled_visit_tasks FOR INSERT TO mycaresight_app
WITH CHECK (public.visit_financial_manager_can_read(agency_id) AND EXISTS(SELECT 1 FROM public.scheduled_visits v
  WHERE v.id=scheduled_visit_id AND v.agency_id=scheduled_visit_tasks.agency_id));
CREATE POLICY scheduled_visit_tasks_manager_delete ON public.scheduled_visit_tasks FOR DELETE TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id) AND EXISTS(SELECT 1 FROM public.scheduled_visits v
  WHERE v.id=scheduled_visit_id AND v.agency_id=scheduled_visit_tasks.agency_id));
CREATE POLICY scheduled_visit_tasks_caregiver_update ON public.scheduled_visit_tasks FOR UPDATE TO mycaresight_app
USING (EXISTS(SELECT 1 FROM public.scheduled_visits v WHERE v.id=scheduled_visit_id
  AND v.agency_id=scheduled_visit_tasks.agency_id AND public.caregiver_can_execute_visit(v.agency_id,v.caregiver_member_id)))
WITH CHECK (EXISTS(SELECT 1 FROM public.scheduled_visits v WHERE v.id=scheduled_visit_id
  AND v.agency_id=scheduled_visit_tasks.agency_id AND public.caregiver_can_execute_visit(v.agency_id,v.caregiver_member_id)));

CREATE POLICY visit_series_manager_select ON public.visit_series FOR SELECT TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id));
CREATE POLICY visit_series_caregiver_select ON public.visit_series FOR SELECT TO mycaresight_app
USING (EXISTS(SELECT 1 FROM public.scheduled_visits v WHERE v.visit_series_id=visit_series.id
  AND v.agency_id=visit_series.agency_id AND public.scheduling_caregiver_can_read(v.agency_id,v.caregiver_member_id)));
CREATE POLICY visit_series_manager_insert ON public.visit_series FOR INSERT TO mycaresight_app WITH CHECK (
  public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients p WHERE p.id=patient_id AND p.agency_id=visit_series.agency_id)
  AND (primary_caregiver_member_id IS NULL OR EXISTS(SELECT 1 FROM public.caregiver_members c WHERE c.id=primary_caregiver_member_id AND c.agency_id=visit_series.agency_id))
  AND (contract_id IS NULL OR EXISTS(SELECT 1 FROM public.patient_service_contracts c WHERE c.id=contract_id AND c.agency_id=visit_series.agency_id AND c.patient_id=visit_series.patient_id))
);

REVOKE ALL ON public.scheduled_visits,public.scheduled_visit_tasks,public.visit_series FROM mycaresight_app;
GRANT SELECT,DELETE ON public.scheduled_visits TO mycaresight_app;
GRANT INSERT (agency_id,visit_series_id,patient_id,caregiver_member_id,contract_id,service_type,visit_date,
  scheduled_start_time,scheduled_end_time,description,notes,visit_type,status,is_recurring,patient_address_id,
  mileage_miles,scheduled_end_date,status_reason) ON public.scheduled_visits TO mycaresight_app;
GRANT UPDATE (caregiver_member_id,contract_id,service_type,visit_date,scheduled_start_time,scheduled_end_time,
  description,notes,visit_type,status,is_recurring,mileage_miles,scheduled_end_date,status_reason,updated_at)
  ON public.scheduled_visits TO mycaresight_app;
GRANT SELECT,DELETE ON public.scheduled_visit_tasks TO mycaresight_app;
GRANT INSERT (agency_id,scheduled_visit_id,task_id,legacy_task_code,sort_order,notes)
  ON public.scheduled_visit_tasks TO mycaresight_app;
GRANT UPDATE (completed_at,updated_at) ON public.scheduled_visit_tasks TO mycaresight_app;
GRANT SELECT ON public.visit_series TO mycaresight_app;
GRANT INSERT (agency_id,patient_id,primary_caregiver_member_id,contract_id,service_type,series_name,
  repeat_frequency,days_of_week,repeat_start,repeat_end,repeat_monthly_rules,notes,status,end_day_offset)
  ON public.visit_series TO mycaresight_app;

COMMIT;
