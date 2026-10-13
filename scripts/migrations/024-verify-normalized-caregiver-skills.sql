-- Read-only verification for migration 024. Expect every boolean to be true
-- and every *_count value to be zero.
WITH schema_state AS (
  SELECT
    to_regclass('public.caregiver_skill_assignments') IS NOT NULL AS caregiver_assignments_table_ok,
    to_regclass('public.patient_skill_requirement_items') IS NOT NULL AS patient_items_table_ok,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'credential_catalog'
        AND column_name = 'scope' AND is_nullable = 'NO'
    ) AS catalog_scope_ok,
    EXISTS (
      SELECT 1 FROM public.configuration_types
      WHERE code = 'CAREGIVER_SKILL_CATEGORY' AND is_active
    ) AS category_type_ok
), rls_state AS (
  SELECT
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
     WHERE oid = 'public.credential_catalog'::regclass) AS catalog_rls_forced,
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
     WHERE oid = 'public.caregiver_skill_assignments'::regclass) AS caregiver_skills_rls_forced,
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
     WHERE oid = 'public.patient_skill_requirement_items'::regclass) AS patient_skills_rls_forced
), integrity AS (
  SELECT
    (SELECT count(*)::integer FROM public.caregiver_skill_assignments assignment
     LEFT JOIN public.caregiver_members caregiver ON caregiver.id = assignment.caregiver_member_id
     LEFT JOIN public.credential_catalog catalog ON catalog.id = assignment.credential_id
     WHERE caregiver.id IS NULL OR catalog.id IS NULL OR caregiver.agency_id IS DISTINCT FROM assignment.agency_id
       OR catalog.credential_type IS DISTINCT FROM 'skill'
       OR (catalog.scope = 'agency' AND catalog.agency_id IS DISTINCT FROM assignment.agency_id))
      AS invalid_caregiver_assignment_count,
    (SELECT count(*)::integer FROM public.patient_skill_requirement_items item
     LEFT JOIN public.patients patient ON patient.id = item.patient_id
     LEFT JOIN public.credential_catalog catalog ON catalog.id = item.credential_id
     WHERE patient.id IS NULL OR catalog.id IS NULL OR patient.agency_id IS DISTINCT FROM item.agency_id
       OR catalog.credential_type IS DISTINCT FROM 'skill'
       OR (catalog.scope = 'agency' AND catalog.agency_id IS DISTINCT FROM item.agency_id))
      AS invalid_patient_requirement_count,
    (SELECT count(*)::integer FROM public.caregiver_members caregiver
     CROSS JOIN LATERAL unnest(COALESCE(caregiver.skills, '{}'::text[])) skill_name
     WHERE trim(skill_name) <> '' AND NOT EXISTS (
       SELECT 1 FROM public.caregiver_skill_assignments assignment
       JOIN public.credential_catalog catalog ON catalog.id = assignment.credential_id
       WHERE assignment.caregiver_member_id = caregiver.id
         AND lower(trim(catalog.name)) = lower(trim(skill_name))
     )) AS unbackfilled_caregiver_skill_count,
    (SELECT count(*)::integer FROM public.patient_skill_requirements requirement
     CROSS JOIN LATERAL (
       SELECT unnest(requirement.skill_codes) AS skill_name, 'required'::text AS level
       UNION ALL SELECT unnest(requirement.preferred_skill_codes), 'preferred'::text
     ) source
     WHERE trim(source.skill_name) <> '' AND NOT EXISTS (
       SELECT 1 FROM public.patient_skill_requirement_items item
       JOIN public.credential_catalog catalog ON catalog.id = item.credential_id
       WHERE item.patient_id = requirement.patient_id
         AND item.requirement_level = source.level
         AND lower(trim(catalog.name)) = lower(trim(source.skill_name))
     )) AS unbackfilled_patient_skill_count
), permissions AS (
  SELECT
    has_table_privilege('mycaresight_app', 'public.credential_catalog', 'SELECT') AS app_can_search_catalog,
    has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'SELECT')
      AND has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'INSERT')
      AND has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'UPDATE')
      AND has_table_privilege('mycaresight_app', 'public.caregiver_skill_assignments', 'DELETE')
      AS app_can_manage_caregiver_assignments,
    has_table_privilege('mycaresight_app', 'public.patient_skill_requirement_items', 'SELECT')
      AND has_table_privilege('mycaresight_app', 'public.patient_skill_requirement_items', 'INSERT')
      AND has_table_privilege('mycaresight_app', 'public.patient_skill_requirement_items', 'UPDATE')
      AND has_table_privilege('mycaresight_app', 'public.patient_skill_requirement_items', 'DELETE')
      AS app_can_manage_patient_requirements,
    NOT has_table_privilege('public', 'public.caregiver_skill_assignments', 'SELECT')
      AND NOT has_table_privilege('public', 'public.patient_skill_requirement_items', 'SELECT')
      AS public_access_blocked
)
SELECT * FROM schema_state CROSS JOIN rls_state CROSS JOIN integrity CROSS JOIN permissions;
