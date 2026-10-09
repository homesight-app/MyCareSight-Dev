-- Read-only verification for migration 019. Expect every boolean to be true
-- and every *_count value to be zero.
WITH trigger_state AS (
  SELECT
    count(*) FILTER (WHERE event_object_table = 'agency_admins') = 3 AS agency_admin_trigger_ok,
    count(*) FILTER (WHERE event_object_table = 'care_coordinators') = 3 AS coordinator_trigger_ok,
    count(*) FILTER (WHERE event_object_table = 'caregiver_members') = 3 AS caregiver_trigger_ok,
    count(*) FILTER (WHERE event_object_table = 'user_profiles') = 1 AS profile_trigger_ok
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name IN (
      'agency_admins_sync_role',
      'care_coordinators_sync_role',
      'caregiver_members_sync_role',
      'user_profiles_remove_previous_agency_role'
    )
), expected AS (
  SELECT admin.user_id, admin.agency_id, profile.role,
    CASE WHEN admin.status IN ('active', 'inactive', 'invited', 'pending') THEN admin.status ELSE 'active' END status
  FROM public.agency_admins admin
  JOIN public.user_profiles profile ON profile.id = admin.user_id AND profile.role = 'company_owner'
  WHERE admin.user_id IS NOT NULL AND admin.agency_id IS NOT NULL
  UNION
  SELECT coordinator.user_id, coordinator.agency_id, profile.role,
    CASE WHEN coordinator.status IN ('active', 'inactive', 'invited', 'pending') THEN coordinator.status ELSE 'active' END
  FROM public.care_coordinators coordinator
  JOIN public.user_profiles profile ON profile.id = coordinator.user_id AND profile.role = 'care_coordinator'
  UNION
  SELECT caregiver.user_id, caregiver.agency_id, profile.role,
    CASE WHEN caregiver.status IN ('active', 'inactive', 'invited', 'pending') THEN caregiver.status ELSE 'active' END
  FROM public.caregiver_members caregiver
  JOIN public.user_profiles profile ON profile.id = caregiver.user_id AND profile.role = 'staff_member'
  WHERE caregiver.user_id IS NOT NULL AND caregiver.agency_id IS NOT NULL
), integrity AS (
  SELECT
    (SELECT count(*)::int FROM (
      SELECT user_id, agency_id, role
      FROM public.user_agency_roles
      GROUP BY user_id, agency_id, role
      HAVING count(*) > 1
    ) duplicates) AS duplicate_count,
    (SELECT count(*)::int
     FROM expected source
     WHERE NOT EXISTS (
       SELECT 1 FROM public.user_agency_roles membership
       WHERE membership.user_id = source.user_id
         AND membership.agency_id = source.agency_id
         AND membership.role = source.role
         AND membership.status = source.status
     )) AS missing_or_stale_count
), constraints AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.user_agency_roles'::regclass
        AND conname = 'user_agency_roles_user_agency_role_key'
        AND contype = 'u'
    ) AS unique_key_ok,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.user_agency_roles'::regclass
        AND conname = 'user_agency_roles_user_id_fkey'
        AND contype = 'f'
    ) AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.user_agency_roles'::regclass
        AND conname = 'user_agency_roles_agency_id_fkey'
        AND contype = 'f'
    ) AS foreign_keys_ok,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.user_agency_roles'::regclass
        AND conname = 'user_agency_roles_role_check'
        AND contype = 'c'
    ) AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.user_agency_roles'::regclass
        AND conname = 'user_agency_roles_status_check'
        AND contype = 'c'
    ) AS checks_ok
), permissions AS (
  SELECT
    has_table_privilege('mycaresight_app', 'public.user_agency_roles', 'SELECT') AS app_can_read,
    NOT has_table_privilege('mycaresight_app', 'public.user_agency_roles', 'INSERT')
      AND NOT has_table_privilege('mycaresight_app', 'public.user_agency_roles', 'UPDATE')
      AND NOT has_table_privilege('mycaresight_app', 'public.user_agency_roles', 'DELETE') AS app_direct_writes_blocked,
    NOT has_table_privilege('public', 'public.user_agency_roles', 'SELECT')
      AND NOT has_table_privilege('public', 'public.user_agency_roles', 'INSERT')
      AND NOT has_table_privilege('public', 'public.user_agency_roles', 'UPDATE')
      AND NOT has_table_privilege('public', 'public.user_agency_roles', 'DELETE') AS public_table_access_blocked,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs')
      THEN NOT has_table_privilege('mycaresight_jobs', 'public.user_agency_roles', 'SELECT')
        AND NOT has_table_privilege('mycaresight_jobs', 'public.user_agency_roles', 'INSERT')
        AND NOT has_table_privilege('mycaresight_jobs', 'public.user_agency_roles', 'UPDATE')
        AND NOT has_table_privilege('mycaresight_jobs', 'public.user_agency_roles', 'DELETE')
      ELSE true
    END AS jobs_access_blocked,
    NOT has_function_privilege('public', 'public.sync_user_agency_role()', 'EXECUTE')
      AND NOT has_function_privilege('public', 'public.remove_previous_profile_agency_role()', 'EXECUTE')
      AS public_execute_blocked
)
SELECT *
FROM trigger_state
CROSS JOIN integrity
CROSS JOIN constraints
CROSS JOIN permissions;
