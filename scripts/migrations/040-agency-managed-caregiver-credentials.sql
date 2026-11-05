-- Make caregiver skills and certifications agency-managed while preserving caregiver read access.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

WITH pending AS (
  SELECT agency_id, caregiver_member_id, count(*)::integer AS approved_count
  FROM public.caregiver_skill_assignments
  WHERE verification_status = 'self_reported'
  GROUP BY agency_id, caregiver_member_id
), approved AS (
  UPDATE public.caregiver_skill_assignments assignment
  SET verification_status = 'verified',
      verified_at = COALESCE(assignment.verified_at, now()),
      updated_at = now()
  WHERE assignment.verification_status = 'self_reported'
  RETURNING assignment.caregiver_member_id
)
INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, details
)
SELECT pending.agency_id, 'caregiver_skill_assignments', pending.caregiver_member_id,
  'VERIFY', jsonb_build_object(
    'operation', 'migration_040_auto_verify_pending_skills',
    'approved_count', pending.approved_count
  )
FROM pending
WHERE EXISTS (
  SELECT 1 FROM approved WHERE approved.caregiver_member_id = pending.caregiver_member_id
);

UPDATE public.caregiver_members caregiver
SET skills = source.names, updated_at = now()
FROM (
  SELECT assignment.caregiver_member_id,
    COALESCE(array_agg(catalog.name ORDER BY catalog.name), '{}'::text[]) AS names
  FROM public.caregiver_skill_assignments assignment
  JOIN public.credential_catalog catalog
    ON catalog.id = assignment.credential_id AND catalog.is_active = true
  WHERE assignment.verification_status = 'verified'
  GROUP BY assignment.caregiver_member_id
) source
WHERE caregiver.id = source.caregiver_member_id
  AND caregiver.skills IS DISTINCT FROM source.names;

UPDATE public.caregiver_members caregiver
SET skills = '{}'::text[], updated_at = now()
WHERE caregiver.skills <> '{}'::text[]
  AND NOT EXISTS (
    SELECT 1
    FROM public.caregiver_skill_assignments assignment
    JOIN public.credential_catalog catalog
      ON catalog.id = assignment.credential_id AND catalog.is_active = true
    WHERE assignment.caregiver_member_id = caregiver.id
      AND assignment.verification_status = 'verified'
  );

DROP POLICY IF EXISTS caregiver_skill_assignments_insert ON public.caregiver_skill_assignments;
DROP POLICY IF EXISTS caregiver_skill_assignments_update ON public.caregiver_skill_assignments;
DROP POLICY IF EXISTS caregiver_skill_assignments_delete ON public.caregiver_skill_assignments;

CREATE POLICY caregiver_skill_assignments_manager_insert
  ON public.caregiver_skill_assignments FOR INSERT TO mycaresight_app
  WITH CHECK (
    (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
    AND verification_status = 'verified'
    AND verified_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.caregiver_members caregiver
      WHERE caregiver.id = caregiver_member_id
        AND caregiver.agency_id = caregiver_skill_assignments.agency_id
    )
    AND EXISTS (
      SELECT 1 FROM public.credential_catalog catalog
      WHERE catalog.id = credential_id
        AND catalog.credential_type = 'skill'
        AND catalog.is_active = true
        AND (catalog.scope = 'system' OR catalog.agency_id = caregiver_skill_assignments.agency_id)
    )
  );

CREATE POLICY caregiver_skill_assignments_manager_update
  ON public.caregiver_skill_assignments FOR UPDATE TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
  WITH CHECK (
    (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
    AND verification_status = 'verified'
    AND verified_at IS NOT NULL
  );

CREATE POLICY caregiver_skill_assignments_manager_delete
  ON public.caregiver_skill_assignments FOR DELETE TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id));

ALTER TABLE public.caregiver_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caregiver_credentials_select ON public.caregiver_credentials;
DROP POLICY IF EXISTS caregiver_credentials_insert ON public.caregiver_credentials;
DROP POLICY IF EXISTS caregiver_credentials_update ON public.caregiver_credentials;
DROP POLICY IF EXISTS caregiver_credentials_delete ON public.caregiver_credentials;
DROP POLICY IF EXISTS caregiver_credentials_insert_own_staff ON public.caregiver_credentials;
DROP POLICY IF EXISTS caregiver_credentials_update_own_staff ON public.caregiver_credentials;
DROP POLICY IF EXISTS caregiver_credentials_delete_own_staff ON public.caregiver_credentials;

CREATE POLICY caregiver_credentials_select
  ON public.caregiver_credentials FOR SELECT TO mycaresight_app
  USING (
    public.skill_actor_is_platform_admin()
    OR public.skill_actor_can_manage_agency(agency_id)
    OR public.skill_actor_is_caregiver(agency_id, caregiver_member_id)
  );

CREATE POLICY caregiver_credentials_manager_insert
  ON public.caregiver_credentials FOR INSERT TO mycaresight_app
  WITH CHECK (
    (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
    AND EXISTS (
      SELECT 1 FROM public.caregiver_members caregiver
      WHERE caregiver.id = caregiver_member_id
        AND caregiver.agency_id = caregiver_credentials.agency_id
    )
  );

CREATE POLICY caregiver_credentials_manager_update
  ON public.caregiver_credentials FOR UPDATE TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
  WITH CHECK (
    (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
    AND EXISTS (
      SELECT 1 FROM public.caregiver_members caregiver
      WHERE caregiver.id = caregiver_member_id
        AND caregiver.agency_id = caregiver_credentials.agency_id
    )
  );

CREATE POLICY caregiver_credentials_manager_delete
  ON public.caregiver_credentials FOR DELETE TO mycaresight_app
  USING (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id));

REVOKE ALL ON public.caregiver_credentials FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caregiver_credentials TO mycaresight_app;

COMMENT ON TABLE public.caregiver_credentials IS
  'Agency-managed caregiver licenses and certifications; caregivers have read-only access to their own records.';

