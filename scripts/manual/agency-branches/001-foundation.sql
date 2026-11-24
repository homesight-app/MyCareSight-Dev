-- OPERATOR ONLY. Not part of the automatic migration manifest.
-- Review docs/plans/agency-branches-rollout.md before execution.
-- Run as an operator allowed to SET ROLE mycaresight_schema_owner, on the
-- explicitly verified development/UAT database first. No production rows here.
BEGIN;
SET LOCAL ROLE mycaresight_schema_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $branch_migration$
DECLARE branch_stage text := 'preflight-actor-functions';
BEGIN
  IF to_regprocedure('public.skill_actor_is_agency_owner(uuid)') IS NULL
     OR to_regprocedure('public.skill_actor_can_manage_agency(uuid)') IS NULL
     OR to_regprocedure('public.skill_actor_is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'branch-preflight: required actor policies absent';
  END IF;
  branch_stage := 'preflight-foundation-absent';
  IF to_regclass('public.agency_branches') IS NOT NULL THEN
    RAISE EXCEPTION 'branch-preflight: foundation already present; run verifier';
  END IF;

  branch_stage := 'preflight-runtime-isolation';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app' AND (rolsuper OR rolbypassrls))
    OR pg_has_role('mycaresight_app', 'mycaresight_schema_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'branch-preflight: runtime role is not isolated';
  END IF;

-- Prevent a new agency committing between the one-time backfill and trigger
-- installation. Other ALTER TABLE locks similarly serialize record backfills.
branch_stage := 'agency-write-lock';
LOCK TABLE public.agencies IN SHARE ROW EXCLUSIVE MODE;

branch_stage := 'branch-table';
CREATE TABLE public.agency_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 40 AND code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_default boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  street_address text, city text, state text, zip_code text, phone text, email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, code), UNIQUE (id, agency_id),
  CHECK (NOT is_default OR status = 'active')
);
CREATE UNIQUE INDEX agency_branches_one_default ON public.agency_branches(agency_id) WHERE is_default;
CREATE INDEX agency_branches_listing ON public.agency_branches(agency_id, status, code, id);

ALTER TABLE public.agency_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_branches FORCE ROW LEVEL SECURITY;
CREATE POLICY branches_owner_maintenance ON public.agency_branches TO mycaresight_schema_owner USING (true) WITH CHECK (true);
CREATE POLICY branches_manager_read ON public.agency_branches FOR SELECT TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id));
CREATE POLICY branches_owner_insert ON public.agency_branches FOR INSERT TO mycaresight_app
  WITH CHECK (public.skill_actor_is_platform_admin() OR public.skill_actor_is_agency_owner(agency_id));
CREATE POLICY branches_owner_update ON public.agency_branches FOR UPDATE TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_is_agency_owner(agency_id))
  WITH CHECK (public.skill_actor_is_platform_admin() OR public.skill_actor_is_agency_owner(agency_id));
REVOKE ALL ON public.agency_branches FROM PUBLIC, mycaresight_app;
GRANT SELECT, INSERT, UPDATE ON public.agency_branches TO mycaresight_app;

branch_stage := 'first-branch-backfill';
-- Existing office address is copied once. Legal agency data remains on agencies;
-- subsequent edits to legal and branch addresses are intentionally independent.
INSERT INTO public.agency_branches(agency_id, code, name, is_default, street_address, city, state, zip_code, phone, email)
SELECT id, 'main', 'Main Branch', true, physical_street_address, physical_city,
  physical_state, physical_zip_code, phone_number, email FROM public.agencies;

CREATE FUNCTION public.branch_create_first() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.agency_branches(agency_id, code, name, is_default, street_address, city, state, zip_code, phone, email)
  VALUES (NEW.id, 'main', 'Main Branch', true, NEW.physical_street_address, NEW.physical_city,
    NEW.physical_state, NEW.physical_zip_code, NEW.phone_number, NEW.email);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.branch_create_first() FROM PUBLIC, mycaresight_app;
CREATE TRIGGER branch_agency_created AFTER INSERT ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.branch_create_first();

-- Enforces at least one default at commit; the unique partial index enforces at
-- most one. The application locks the agency row before changing defaults.
CREATE FUNCTION public.branch_require_default() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agencies WHERE id = OLD.agency_id)
     AND NOT EXISTS (SELECT 1 FROM public.agency_branches WHERE agency_id = OLD.agency_id AND is_default) THEN
    RAISE EXCEPTION 'branch-invariant: agency requires active default' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.agency_id <> OLD.agency_id THEN
    RAISE EXCEPTION 'branch-invariant: cannot move branches across agencies' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.branch_require_default() FROM PUBLIC, mycaresight_app;
CREATE CONSTRAINT TRIGGER branches_require_default AFTER UPDATE OR DELETE ON public.agency_branches
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.branch_require_default();

branch_stage := 'record-backfill';
ALTER TABLE public.leads ADD COLUMN branch_id uuid;
ALTER TABLE public.patients ADD COLUMN branch_id uuid;
-- FORCE RLS remains enabled throughout. This transaction-local maintenance
-- policy permits only the schema owner to backfill and is removed before commit.
CREATE POLICY branches_patient_backfill ON public.patients TO mycaresight_schema_owner USING (true) WITH CHECK (true);
UPDATE public.leads l SET branch_id = b.id FROM public.agency_branches b
  WHERE b.agency_id = l.agency_id AND b.is_default;
UPDATE public.patients p SET branch_id = b.id FROM public.agency_branches b
  WHERE b.agency_id = p.agency_id AND b.is_default;
ALTER TABLE public.patients ALTER COLUMN branch_id SET NOT NULL;
DROP POLICY branches_patient_backfill ON public.patients;
ALTER TABLE public.leads ADD CONSTRAINT lead_branch_agency_fk FOREIGN KEY (branch_id, agency_id)
  REFERENCES public.agency_branches(id, agency_id) ON DELETE RESTRICT;
ALTER TABLE public.leads ADD CONSTRAINT lead_branch_presence CHECK ((agency_id IS NULL) = (branch_id IS NULL));
ALTER TABLE public.patients ADD CONSTRAINT patient_branch_agency_fk FOREIGN KEY (branch_id, agency_id)
  REFERENCES public.agency_branches(id, agency_id) ON DELETE RESTRICT;
CREATE INDEX leads_branch_listing ON public.leads(agency_id, branch_id, status, created_at DESC, id);
CREATE INDEX patients_branch_listing ON public.patients(agency_id, branch_id, status, created_at DESC, id);

branch_stage := 'supporting-indexes';
CREATE INDEX agency_programs_listing ON public.applications(agency_id, created_at DESC, id) WHERE playbook_id IS NOT NULL;
CREATE INDEX application_playbook_items_application_status_idx ON public.application_playbook_items(application_id, status);
CREATE INDEX scheduled_visits_agency_patient_idx ON public.scheduled_visits(agency_id, patient_id);

branch_stage := 'record-triggers';

CREATE FUNCTION public.branch_assign_default() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id
    AND NOT (public.skill_actor_is_platform_admin() OR public.skill_actor_is_agency_owner(NEW.agency_id)) THEN
    RAISE EXCEPTION 'branch-invariant: branch transfer requires agency owner' USING ERRCODE='42501';
  END IF;
  IF NEW.agency_id IS NULL THEN
    IF NEW.branch_id IS NOT NULL THEN RAISE EXCEPTION 'branch-invariant: branch requires agency' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.branch_id IS NULL THEN
    SELECT id INTO NEW.branch_id FROM public.agency_branches WHERE agency_id = NEW.agency_id AND is_default;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agency_branches WHERE id = NEW.branch_id AND agency_id = NEW.agency_id
    AND (status = 'active' OR (TG_OP = 'UPDATE' AND NEW.branch_id = OLD.branch_id AND NEW.agency_id = OLD.agency_id))) THEN
    RAISE EXCEPTION 'branch-invariant: invalid branch assignment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.branch_assign_default() FROM PUBLIC, mycaresight_app;
CREATE TRIGGER leads_branch_default BEFORE INSERT OR UPDATE OF agency_id, branch_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.branch_assign_default();
CREATE TRIGGER patients_branch_default BEFORE INSERT OR UPDATE OF agency_id, branch_id ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.branch_assign_default();

-- Invoker rights preserve the existing active agency-manager visit-read RLS.
-- Do not enable historical transfers before the Phase 2 snapshot workflow.
CREATE FUNCTION public.branch_patient_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id AND EXISTS (
    SELECT 1 FROM public.scheduled_visits WHERE agency_id = NEW.agency_id AND patient_id = NEW.id
  ) THEN RAISE EXCEPTION 'branch-invariant: scheduled client requires reviewed transfer' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.branch_patient_history_guard() FROM PUBLIC, mycaresight_app;
CREATE TRIGGER patients_branch_history BEFORE UPDATE OF branch_id ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.branch_patient_history_guard();

branch_stage := 'program-links';
ALTER TABLE public.applications ADD CONSTRAINT application_id_agency_unique UNIQUE (id, agency_id);
CREATE TABLE public.application_branches (
  application_id uuid NOT NULL,
  agency_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  PRIMARY KEY (application_id, branch_id),
  FOREIGN KEY (application_id, agency_id) REFERENCES public.applications(id, agency_id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id, agency_id) REFERENCES public.agency_branches(id, agency_id) ON DELETE RESTRICT
);
CREATE INDEX application_branches_filter ON public.application_branches(agency_id, branch_id, application_id);
ALTER TABLE public.application_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_branches FORCE ROW LEVEL SECURITY;
CREATE POLICY application_branches_maintenance ON public.application_branches TO mycaresight_schema_owner USING (true) WITH CHECK (true);
CREATE POLICY application_branches_manager_read ON public.application_branches FOR SELECT TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id));
CREATE POLICY application_branches_owner_write ON public.application_branches FOR ALL TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_is_agency_owner(agency_id))
  WITH CHECK (public.skill_actor_is_platform_admin() OR public.skill_actor_is_agency_owner(agency_id));
REVOKE ALL ON public.application_branches FROM PUBLIC, mycaresight_app;
GRANT SELECT, INSERT, DELETE ON public.application_branches TO mycaresight_app;
INSERT INTO public.application_branches(application_id, agency_id, branch_id)
SELECT a.id, a.agency_id, b.id FROM public.applications a
JOIN public.agency_branches b ON b.agency_id = a.agency_id AND b.is_default
WHERE a.caregiver_member_id IS NULL;

CREATE FUNCTION public.branch_application_default() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.agency_id IS NOT DISTINCT FROM OLD.agency_id THEN RETURN NEW; END IF;
  IF NEW.agency_id IS NOT NULL AND NEW.caregiver_member_id IS NULL THEN
    INSERT INTO public.application_branches(application_id, agency_id, branch_id)
    SELECT NEW.id, NEW.agency_id, id FROM public.agency_branches WHERE agency_id = NEW.agency_id AND is_default
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.branch_application_default() FROM PUBLIC, mycaresight_app;
CREATE TRIGGER application_branch_default AFTER INSERT OR UPDATE OF agency_id ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.branch_application_default();

-- Empty application associations are never valid for agency-owned programs.
CREATE FUNCTION public.branch_application_required() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.applications WHERE id = OLD.application_id AND agency_id = OLD.agency_id AND caregiver_member_id IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.application_branches WHERE application_id = OLD.application_id AND agency_id = OLD.agency_id) THEN
    RAISE EXCEPTION 'branch-invariant: program requires at least one branch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.branch_application_required() FROM PUBLIC, mycaresight_app;
CREATE CONSTRAINT TRIGGER application_branch_required AFTER DELETE ON public.application_branches
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.branch_application_required();

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING MESSAGE = format('Branch foundation stopped: stage=%s code=%s. Changes rolled back; issue ROLLBACK before retry.', branch_stage, SQLSTATE), ERRCODE = SQLSTATE;
END $branch_migration$;
COMMIT;
