-- Read-only verification for migration 022. Expect every boolean to be true
-- and every *_count value to be zero.
WITH schema_state AS (
  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'patient_skill_requirements'
        AND column_name = 'preferred_skill_codes'
        AND is_nullable = 'NO'
    ) AS preferred_skills_column_ok,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.patient_skill_requirements'::regclass
        AND conname = 'patient_skill_requirements_skill_sets_check'
        AND contype = 'c'
    ) AS skill_sets_check_ok,
    (SELECT relrowsecurity AND relforcerowsecurity
     FROM pg_class WHERE oid = 'public.patient_skill_requirements'::regclass) AS rls_forced
), policy_state AS (
  SELECT
    count(*) FILTER (WHERE policyname = 'patient_skill_requirements_manager_select' AND cmd = 'SELECT') = 1
      AS manager_select_policy_ok,
    count(*) FILTER (WHERE policyname = 'patient_skill_requirements_manager_insert' AND cmd = 'INSERT') = 1
      AS manager_insert_policy_ok,
    count(*) FILTER (WHERE policyname = 'patient_skill_requirements_manager_update' AND cmd = 'UPDATE') = 1
      AS manager_update_policy_ok
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'patient_skill_requirements'
), permissions AS (
  SELECT
    has_table_privilege('mycaresight_app', 'public.patient_skill_requirements', 'SELECT') AS app_can_read,
    has_column_privilege('mycaresight_app', 'public.patient_skill_requirements', 'skill_codes', 'INSERT')
      AND has_column_privilege('mycaresight_app', 'public.patient_skill_requirements', 'preferred_skill_codes', 'INSERT')
      AS app_can_insert_skill_sets,
    has_column_privilege('mycaresight_app', 'public.patient_skill_requirements', 'skill_codes', 'UPDATE')
      AND has_column_privilege('mycaresight_app', 'public.patient_skill_requirements', 'preferred_skill_codes', 'UPDATE')
      AS app_can_update_skill_sets,
    NOT has_table_privilege('mycaresight_app', 'public.patient_skill_requirements', 'DELETE')
      AND NOT has_table_privilege('public', 'public.patient_skill_requirements', 'SELECT')
      AS excess_access_blocked
), integrity AS (
  SELECT count(*)::integer AS overlapping_skill_set_count
  FROM public.patient_skill_requirements
  WHERE skill_codes && preferred_skill_codes
)
SELECT *
FROM schema_state
CROSS JOIN policy_state
CROSS JOIN permissions
CROSS JOIN integrity;
