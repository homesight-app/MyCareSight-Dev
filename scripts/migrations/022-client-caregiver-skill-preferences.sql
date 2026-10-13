-- 022: Add preferred caregiver skills and protect client skill requirements.
-- Apply after 009 and before deploying the matching/editor changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '022 must not run against Supabase';
  END IF;
  IF to_regclass('public.patient_skill_requirements') IS NULL
     OR to_regclass('public.patients') IS NULL
     OR to_regclass('public.credential_catalog') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '022 requires the Neon client, credential, and audit tables';
  END IF;
  IF to_regprocedure('public.visit_financial_manager_can_read(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Run migration 009 before migration 022';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '022 requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

ALTER TABLE public.patient_skill_requirements
  ADD COLUMN IF NOT EXISTS preferred_skill_codes text[] NOT NULL DEFAULT '{}'::text[];

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.patient_skill_requirements'::regclass
      AND conname = 'patient_skill_requirements_skill_sets_check'
  ) THEN
    ALTER TABLE public.patient_skill_requirements
      ADD CONSTRAINT patient_skill_requirements_skill_sets_check
      CHECK (
        cardinality(skill_codes) <= 100
        AND cardinality(preferred_skill_codes) <= 100
        AND array_position(skill_codes, NULL) IS NULL
        AND array_position(preferred_skill_codes, NULL) IS NULL
        AND NOT (skill_codes && preferred_skill_codes)
      );
  END IF;
END
$constraints$;

ALTER TABLE public.patient_skill_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_skill_requirements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_skill_requirements_manager_select
  ON public.patient_skill_requirements;
CREATE POLICY patient_skill_requirements_manager_select
  ON public.patient_skill_requirements FOR SELECT TO mycaresight_app
  USING (
    public.visit_financial_manager_can_read(agency_id)
    AND EXISTS (
      SELECT 1 FROM public.patients patient
      WHERE patient.id = patient_id
        AND patient.agency_id = patient_skill_requirements.agency_id
    )
  );

DROP POLICY IF EXISTS patient_skill_requirements_manager_insert
  ON public.patient_skill_requirements;
CREATE POLICY patient_skill_requirements_manager_insert
  ON public.patient_skill_requirements FOR INSERT TO mycaresight_app
  WITH CHECK (
    public.visit_financial_manager_can_read(agency_id)
    AND EXISTS (
      SELECT 1 FROM public.patients patient
      WHERE patient.id = patient_id
        AND patient.agency_id = patient_skill_requirements.agency_id
    )
  );

DROP POLICY IF EXISTS patient_skill_requirements_manager_update
  ON public.patient_skill_requirements;
CREATE POLICY patient_skill_requirements_manager_update
  ON public.patient_skill_requirements FOR UPDATE TO mycaresight_app
  USING (
    public.visit_financial_manager_can_read(agency_id)
    AND EXISTS (
      SELECT 1 FROM public.patients patient
      WHERE patient.id = patient_id
        AND patient.agency_id = patient_skill_requirements.agency_id
    )
  )
  WITH CHECK (
    public.visit_financial_manager_can_read(agency_id)
    AND EXISTS (
      SELECT 1 FROM public.patients patient
      WHERE patient.id = patient_id
        AND patient.agency_id = patient_skill_requirements.agency_id
    )
  );

REVOKE ALL ON public.patient_skill_requirements FROM PUBLIC, mycaresight_app;
GRANT SELECT ON public.patient_skill_requirements TO mycaresight_app;
GRANT INSERT (agency_id, patient_id, skill_codes, preferred_skill_codes)
  ON public.patient_skill_requirements TO mycaresight_app;
GRANT UPDATE (skill_codes, preferred_skill_codes, updated_at)
  ON public.patient_skill_requirements TO mycaresight_app;

COMMENT ON COLUMN public.patient_skill_requirements.skill_codes IS
  'Canonical caregiver skill names required for assignment eligibility.';
COMMENT ON COLUMN public.patient_skill_requirements.preferred_skill_codes IS
  'Canonical caregiver skill names that improve ranking but do not control eligibility.';

COMMIT;
