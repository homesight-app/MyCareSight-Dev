-- Read-only verification for migration 021. Expect both booleans true and all
-- *_count values zero. Pending/invited memberships remain non-login states.
WITH candidates AS (
  SELECT
    admin.user_id, admin.agency_id, 'company_owner'::text AS role,
    CASE WHEN admin.status IN ('active', 'inactive', 'invited', 'pending')
      THEN admin.status ELSE 'active' END AS status,
    CASE admin.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END AS status_priority,
    admin.updated_at AS source_updated_at, admin.id AS source_id
  FROM public.agency_admins admin
  JOIN public.user_profiles profile
    ON profile.id = admin.user_id
   AND profile.role = 'company_owner'
   AND profile.agency_id = admin.agency_id
  WHERE admin.user_id IS NOT NULL AND admin.agency_id IS NOT NULL

  UNION ALL

  SELECT
    coordinator.user_id, coordinator.agency_id, 'care_coordinator'::text,
    CASE WHEN coordinator.status IN ('active', 'inactive', 'invited', 'pending')
      THEN coordinator.status ELSE 'active' END,
    CASE coordinator.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END,
    coordinator.updated_at, coordinator.id
  FROM public.care_coordinators coordinator
  JOIN public.user_profiles profile
    ON profile.id = coordinator.user_id
   AND profile.role = 'care_coordinator'
   AND profile.agency_id = coordinator.agency_id

  UNION ALL

  SELECT
    caregiver.user_id, caregiver.agency_id, 'staff_member'::text,
    CASE WHEN caregiver.status IN ('active', 'inactive', 'invited', 'pending')
      THEN caregiver.status ELSE 'active' END,
    CASE caregiver.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'invited' THEN 3 ELSE 4 END,
    caregiver.updated_at, caregiver.id
  FROM public.caregiver_members caregiver
  JOIN public.user_profiles profile
    ON profile.id = caregiver.user_id
   AND profile.role = 'staff_member'
   AND profile.agency_id = caregiver.agency_id
  WHERE caregiver.user_id IS NOT NULL AND caregiver.agency_id IS NOT NULL
), expected AS (
  SELECT DISTINCT ON (user_id, agency_id, role)
    user_id, agency_id, role, status
  FROM candidates
  ORDER BY user_id, agency_id, role, status_priority, source_updated_at DESC, source_id
), integrity AS (
  SELECT
    (SELECT count(*)::int
     FROM expected source
     WHERE NOT EXISTS (
       SELECT 1 FROM public.user_agency_roles membership
       WHERE membership.user_id = source.user_id
         AND membership.agency_id = source.agency_id
         AND membership.role = source.role
         AND membership.status = source.status
     )) AS missing_or_stale_count,
    (SELECT count(*)::int
     FROM public.user_agency_roles membership
     WHERE NOT EXISTS (
       SELECT 1 FROM expected source
       WHERE source.user_id = membership.user_id
         AND source.agency_id = membership.agency_id
         AND source.role = membership.role
     )) AS unexpected_membership_count
), trigger_state AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.user_profiles'::regclass
        AND tgname = 'user_profiles_remove_previous_agency_role'
        AND tgenabled <> 'D'
    ) AS profile_cleanup_trigger_ok,
    NOT has_function_privilege(
      'public', 'public.remove_previous_profile_agency_role()', 'EXECUTE'
    ) AS public_execute_blocked
)
SELECT * FROM integrity CROSS JOIN trigger_state;
