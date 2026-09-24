-- Read-only verification for 015a. Expect one row with reconciliation_pass=true.
WITH mismatches AS (
  SELECT count(*)::int AS mismatch_count
  FROM public.user_profiles profile
  JOIN public.user_agency_roles membership
    ON membership.user_id = profile.id
   AND membership.agency_id = profile.agency_id
   AND membership.status = 'active'
  WHERE profile.is_active = true
    AND profile.role IN ('company_owner', 'care_coordinator', 'staff_member')
    AND membership.role <> profile.role
), orphaned_caregivers AS (
  SELECT count(*)::int AS orphaned_count
  FROM public.user_profiles profile
  JOIN public.caregiver_members caregiver
    ON caregiver.user_id = profile.id
   AND caregiver.agency_id = profile.agency_id
  WHERE profile.is_active = true
    AND profile.role <> 'staff_member'
), audit_state AS (
  SELECT count(*)::int AS repair_audit_count
  FROM public.audit_log
  WHERE table_name = 'user_profiles'
    AND action = 'RECONCILE_ROLE'
    AND details @> '{"old_role":"company_owner","new_role":"staff_member"}'::jsonb
)
SELECT
  mismatches.mismatch_count,
  orphaned_caregivers.orphaned_count,
  audit_state.repair_audit_count,
  mismatches.mismatch_count = 0
    AND orphaned_caregivers.orphaned_count = 0
    AND audit_state.repair_audit_count = 1 AS reconciliation_pass
FROM mismatches
CROSS JOIN orphaned_caregivers
CROSS JOIN audit_state;
