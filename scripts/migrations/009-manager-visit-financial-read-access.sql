-- 009: active agency-manager read access only. Manual Dev first, then unused UAT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
DO $preflight$
DECLARE t text;
BEGIN
 IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '009 must not run against Supabase'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN RAISE EXCEPTION '009 requires independent migration owner and restricted runtime role'; END IF;
 FOREACH t IN ARRAY ARRAY['visit_time_entries','visit_approvals','visit_financials','visit_adjustment_history']
 LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t) AND relrowsecurity AND relforcerowsecurity)
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.'||t))
   OR has_table_privilege('mycaresight_app','public.'||t,'SELECT') THEN
   RAISE EXCEPTION '009 requires closed staged table: %',t;
  END IF;
 END LOOP;
 IF to_regclass('public.user_agency_roles') IS NULL OR to_regclass('public.audit_log') IS NULL THEN
  RAISE EXCEPTION '009 missing identity or audit dependencies';
 END IF;
 IF NOT has_table_privilege('mycaresight_app','public.audit_log','INSERT') THEN
  RAISE EXCEPTION '009 requires runtime audit INSERT';
 END IF;
END $preflight$;

CREATE FUNCTION public.visit_financial_manager_can_read(note_agency uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_profiles p JOIN public.user_agency_roles m
  ON m.user_id=p.id AND m.agency_id=note_agency AND m.role=p.role AND m.status='active'
  WHERE p.id::text=NULLIF(current_setting('app.current_user_id',true),'') AND p.is_active=true
  AND p.role IN ('company_owner','care_coordinator'))
$$;
REVOKE ALL ON FUNCTION public.visit_financial_manager_can_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visit_financial_manager_can_read(uuid) TO mycaresight_app;

CREATE POLICY visit_time_entries_manager_select ON public.visit_time_entries FOR SELECT TO mycaresight_app USING (
 public.visit_financial_manager_can_read(agency_id) AND EXISTS(
  SELECT 1 FROM public.scheduled_visits v WHERE v.id=scheduled_visit_id AND v.agency_id=visit_time_entries.agency_id
  AND v.patient_id=visit_time_entries.patient_id AND v.caregiver_member_id=visit_time_entries.caregiver_member_id));
CREATE POLICY visit_approvals_manager_select ON public.visit_approvals FOR SELECT TO mycaresight_app USING (
 public.visit_financial_manager_can_read(agency_id)
 AND EXISTS(SELECT 1 FROM public.visit_time_entries e WHERE e.id=visit_time_entry_id AND e.agency_id=visit_approvals.agency_id
  AND e.scheduled_visit_id=visit_approvals.scheduled_visit_id AND e.patient_id=visit_approvals.patient_id
  AND e.caregiver_member_id=visit_approvals.caregiver_member_id));
CREATE POLICY visit_financials_manager_select ON public.visit_financials FOR SELECT TO mycaresight_app USING (
 public.visit_financial_manager_can_read(agency_id)
 AND EXISTS(SELECT 1 FROM public.visit_time_entries e WHERE e.id=visit_time_entry_id AND e.agency_id=visit_financials.agency_id
  AND e.scheduled_visit_id=visit_financials.scheduled_visit_id AND e.patient_id=visit_financials.patient_id
  AND e.caregiver_member_id=visit_financials.caregiver_member_id)
 AND (visit_approval_id IS NULL OR EXISTS(SELECT 1 FROM public.visit_approvals a WHERE a.id=visit_approval_id
  AND a.agency_id=visit_financials.agency_id AND a.visit_time_entry_id=visit_financials.visit_time_entry_id)));
CREATE POLICY visit_adjustment_history_manager_select ON public.visit_adjustment_history FOR SELECT TO mycaresight_app USING (
 public.visit_financial_manager_can_read(agency_id)
 AND EXISTS(SELECT 1 FROM public.visit_time_entries e WHERE e.id=visit_time_entry_id AND e.agency_id=visit_adjustment_history.agency_id));

GRANT SELECT ON public.visit_time_entries,public.visit_approvals,public.visit_financials,public.visit_adjustment_history TO mycaresight_app;
COMMIT;
