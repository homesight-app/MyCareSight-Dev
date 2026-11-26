-- OPERATOR ONLY. Upgrade a foundation installed from an earlier Phase 1 copy.
-- Fresh installations using the current 001 script do not need this patch.
-- Existing branch associations are never inferred, replaced or backfilled here.
BEGIN;
SET LOCAL ROLE mycaresight_schema_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $branch_upgrade$
DECLARE branch_stage text := 'preflight-foundation';
BEGIN
  IF to_regclass('public.agency_branches') IS NULL OR to_regclass('public.application_branches') IS NULL THEN
    RAISE EXCEPTION 'Branch foundation must be installed first';
  END IF;
  branch_stage := 'preflight-runtime-isolation';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app' AND (rolsuper OR rolbypassrls))
    OR pg_has_role('mycaresight_app', 'mycaresight_schema_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'Runtime role is not isolated';
  END IF;
  branch_stage := 'program-write-lock';
  LOCK TABLE public.applications, public.application_branches IN ACCESS EXCLUSIVE MODE;
  branch_stage := 'program-links-review';
  IF EXISTS (SELECT 1 FROM public.applications a WHERE a.agency_id IS NOT NULL AND a.caregiver_member_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.application_branches b WHERE b.application_id = a.id AND b.agency_id = a.agency_id)) THEN
    RAISE EXCEPTION 'Existing program links require operator review' USING ERRCODE = '23514';
  END IF;
  branch_stage := 'program-triggers';
  DROP TRIGGER IF EXISTS application_branch_default ON public.applications;
  DROP TRIGGER IF EXISTS application_branch_required ON public.application_branches;
  DROP TRIGGER IF EXISTS application_branch_required_on_application ON public.applications;
CREATE OR REPLACE FUNCTION public.branch_application_default() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.agency_id IS NOT DISTINCT FROM OLD.agency_id
    AND NEW.caregiver_member_id IS NOT DISTINCT FROM OLD.caregiver_member_id THEN RETURN NEW; END IF;
  IF NEW.agency_id IS NOT NULL AND NEW.caregiver_member_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.application_branches WHERE application_id = NEW.id AND agency_id = NEW.agency_id) THEN
    INSERT INTO public.application_branches(application_id, agency_id, branch_id)
    SELECT NEW.id, NEW.agency_id, id FROM public.agency_branches WHERE agency_id = NEW.agency_id AND is_default
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.branch_application_default() FROM PUBLIC, mycaresight_app;
CREATE TRIGGER application_branch_default AFTER INSERT OR UPDATE OF agency_id, caregiver_member_id ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.branch_application_default();

-- Empty application associations are never valid for agency-owned programs.
CREATE OR REPLACE FUNCTION public.branch_application_required() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  application_id_to_check uuid;
  application_agency uuid;
  application_caregiver uuid;
BEGIN
  IF TG_RELID = 'public.applications'::regclass THEN application_id_to_check := NEW.id;
  ELSE application_id_to_check := OLD.application_id; END IF;
  -- Serialize the final membership check for this application, including
  -- deletions of different links in concurrent transactions. A deleted parent
  -- is legitimate (its links cascade); a surviving agency program needs a link.
  -- NO KEY UPDATE also serializes these checks, while remaining compatible
  -- with the KEY SHARE locks used by ordinary document/child foreign keys.
  SELECT agency_id, caregiver_member_id INTO application_agency, application_caregiver
    FROM public.applications WHERE id = application_id_to_check FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF application_agency IS NOT NULL AND application_caregiver IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.application_branches WHERE application_id = application_id_to_check AND agency_id = application_agency) THEN
    RAISE EXCEPTION 'branch-invariant: program requires at least one branch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.branch_application_required() FROM PUBLIC, mycaresight_app;
CREATE CONSTRAINT TRIGGER application_branch_required AFTER DELETE ON public.application_branches
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.branch_application_required();
CREATE CONSTRAINT TRIGGER application_branch_required_on_application AFTER INSERT OR UPDATE ON public.applications
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.agency_id IS NOT NULL AND NEW.caregiver_member_id IS NULL)
  EXECUTE FUNCTION public.branch_application_required();

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING MESSAGE = format('Branch upgrade stopped: stage=%s code=%s. Changes rolled back; issue ROLLBACK before retry.', branch_stage, SQLSTATE), ERRCODE = SQLSTATE;
END $branch_upgrade$;
COMMIT;
