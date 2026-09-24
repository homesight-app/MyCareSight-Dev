-- 013: agency-manager lifecycle access for patient service contracts. Manual Dev first, then unused UAT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '013 must not run against Supabase'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
     OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
    RAISE EXCEPTION '013 requires independent migration owner and restricted runtime role';
  END IF;
  IF to_regclass('public.patient_service_contracts') IS NULL OR to_regclass('public.patients') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '013 missing contract, patient, or audit dependency';
  END IF;
  IF to_regprocedure('public.visit_financial_manager_can_read(uuid)') IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_financials'
       AND policyname='visit_financials_manager_update') THEN
    RAISE EXCEPTION '013 requires verified 009 and 011/011a manager financial access';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid='public.patient_service_contracts'::regclass
      AND (relrowsecurity OR relforcerowsecurity))
     OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patient_service_contracts') THEN
    RAISE EXCEPTION '013 requires the unstaged patient_service_contracts table';
  END IF;
  IF NOT has_table_privilege('mycaresight_app','public.patient_service_contracts','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION '013 expected the legacy broad runtime grants before replacement';
  END IF;
  IF NOT has_table_privilege('mycaresight_app','public.audit_log','INSERT') THEN
    RAISE EXCEPTION '013 requires runtime audit INSERT';
  END IF;
END $preflight$;

CREATE INDEX patient_service_contracts_agency_patient_timeline_idx
  ON public.patient_service_contracts
  (agency_id,patient_id,contract_type,service_type,effective_date DESC,created_at DESC);

ALTER TABLE public.patient_service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_service_contracts FORCE ROW LEVEL SECURITY;

CREATE POLICY patient_service_contracts_manager_select ON public.patient_service_contracts
FOR SELECT TO mycaresight_app USING (
  public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients patient
    WHERE patient.id=patient_service_contracts.patient_id AND patient.agency_id=patient_service_contracts.agency_id)
);
CREATE POLICY patient_service_contracts_manager_insert ON public.patient_service_contracts
FOR INSERT TO mycaresight_app WITH CHECK (
  public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients patient
    WHERE patient.id=patient_service_contracts.patient_id AND patient.agency_id=patient_service_contracts.agency_id)
);
CREATE POLICY patient_service_contracts_manager_update ON public.patient_service_contracts
FOR UPDATE TO mycaresight_app
USING (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients patient
    WHERE patient.id=patient_service_contracts.patient_id AND patient.agency_id=patient_service_contracts.agency_id))
WITH CHECK (public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients patient
    WHERE patient.id=patient_service_contracts.patient_id AND patient.agency_id=patient_service_contracts.agency_id));
CREATE POLICY patient_service_contracts_manager_delete ON public.patient_service_contracts
FOR DELETE TO mycaresight_app USING (
  public.visit_financial_manager_can_read(agency_id)
  AND EXISTS(SELECT 1 FROM public.patients patient
    WHERE patient.id=patient_service_contracts.patient_id AND patient.agency_id=patient_service_contracts.agency_id)
);

REVOKE ALL ON public.patient_service_contracts FROM mycaresight_app;
GRANT SELECT,DELETE ON public.patient_service_contracts TO mycaresight_app;
GRANT INSERT (agency_id,patient_id,contract_name,contract_type,service_type,billing_code_id,bill_rate,
  bill_unit_type,weekly_hours_limit,effective_date,end_date,status,note,bill_mileage,mileage_bill_rate_per_mile)
  ON public.patient_service_contracts TO mycaresight_app;
GRANT UPDATE (contract_name,bill_rate,end_date,status,note,bill_mileage,mileage_bill_rate_per_mile,updated_at)
  ON public.patient_service_contracts TO mycaresight_app;

COMMIT;
