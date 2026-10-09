import type { UserRole } from '@/types/auth'

export const AGENCY_MANAGER_ROLES: ReadonlySet<UserRole> = new Set([
  'company_owner',
  'care_coordinator',
])

export const PLATFORM_OR_AGENCY_MANAGER_ROLES: ReadonlySet<UserRole> = new Set([
  'admin',
  'expert',
  ...AGENCY_MANAGER_ROLES,
])

export function isAgencyManagerRole(role: string | null | undefined): role is UserRole {
  return AGENCY_MANAGER_ROLES.has(role as UserRole)
}

