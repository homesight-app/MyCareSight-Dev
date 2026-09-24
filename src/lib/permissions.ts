'use server'

import { getSession } from '@/lib/auth'

const AGENCY_ROLES = ['company_owner', 'care_coordinator'] as const
const ACTIVE_STATUSES = ['active'] as const

/**
 * Shared permission guard for all agency people / onboarding server actions.
 * Replaces the copy-pasted requirePlatformStaffOrAgencyAdmin helper that
 * previously lived in each action file and made its own DB query each time.
 *
 * Reads the agency roles returned by the current revocable session check.
 */
export async function requirePlatformStaffOrAgencyRole(agencyId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }

  const profile = session.profile as { role?: string; is_active?: boolean } | null
  const role = profile?.role

  // getSession has already rejected inactive profiles.
  if (role === 'admin' || role === 'expert') return { error: null, session }

  // Deactivated non-platform accounts are blocked
  if (profile?.is_active === false) {
    return { error: 'Account is deactivated', session: null }
  }

  // Agency-level check: read from pre-loaded session roles (no DB query)
  const hasAccess = session.agencyRoles?.some(
    r =>
      r.agency_id === agencyId &&
      (AGENCY_ROLES as readonly string[]).includes(r.role) &&
      (ACTIVE_STATUSES as readonly string[]).includes(r.status)
  )

  if (hasAccess) return { error: null, session }
  return { error: 'Forbidden', session: null }
}
