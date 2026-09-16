'use server'

import sql from '@/db'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'
import { getAgencyKeyStaff, getAgencyAdmins, getAgencyCareCoordinators } from '@/lib/supabase/query/agency-people'

// ——— Shared types (imported by AgencyPeopleTab) ————————————————————————————

export interface RawKeyStaff {
  id: string
  agency_id: string
  officer_role: string | null
  officer_roles: string[]
  full_legal_name: string | null
  telephone: string | null
  email: string | null
  ownership_percentage: string | null
  user_profile_id: string | null
  status: string
  /** Loaded from user_profiles — null when no linked user account exists. */
  is_active: boolean | null
}

export interface RawAdmin {
  id: string
  user_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  status: string | null
  /** Loaded from user_profiles — null when no user account exists. */
  is_active: boolean | null
}

export interface RawCoordinator {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  email: string
  status: string
  /** Loaded from user_profiles — null when no user account exists. */
  is_active: boolean | null
}

export interface PeopleData {
  keyStaff: RawKeyStaff[]
  admins: RawAdmin[]
  coordinators: RawCoordinator[]
  error: string | null
}

// ——— Server action ——————————————————————————————————————————————————————————

export async function getPeopleForAgency(agencyId: string): Promise<PeopleData> {
  const { error: authErr } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr) return { keyStaff: [], admins: [], coordinators: [], error: authErr }

  const [staffRes, adminsRes, coordsRes] = await Promise.all([
    getAgencyKeyStaff(agencyId),
    getAgencyAdmins(agencyId),
    getAgencyCareCoordinators(agencyId),
  ])

  const err = staffRes.error || adminsRes.error || coordsRes.error
  if (err) return { keyStaff: [], admins: [], coordinators: [], error: err.message }

  // Collect all user_ids (admins, coordinators, and linked key staff) and fetch is_active
  // in one query. user_profiles.is_active is the single source of truth — role table status
  // columns are no longer used for active/inactive state.
  const userIds = [
    ...(adminsRes.data ?? []).map(a => a.user_id).filter(Boolean) as string[],
    ...(coordsRes.data ?? []).map(c => c.user_id).filter(Boolean) as string[],
    ...(staffRes.data ?? []).map((s: { user_profile_id?: string | null }) => s.user_profile_id).filter(Boolean) as string[],
  ]
  const isActiveByUserId = new Map<string, boolean>()
  if (userIds.length > 0) {
    const profiles = await sql<{ id: string; is_active: boolean }[]>`
      SELECT id, is_active FROM user_profiles WHERE id = ANY(${userIds}::uuid[])
    `
    profiles.forEach(p => isActiveByUserId.set(p.id, p.is_active))
  }

  const admins: RawAdmin[] = (adminsRes.data ?? []).map(a => ({
    ...a,
    is_active: a.user_id ? (isActiveByUserId.get(a.user_id) ?? null) : null,
  })) as RawAdmin[]

  const coordinators: RawCoordinator[] = (coordsRes.data ?? []).map(c => ({
    ...c,
    is_active: c.user_id ? (isActiveByUserId.get(c.user_id) ?? null) : null,
  })) as RawCoordinator[]

  const keyStaff: RawKeyStaff[] = (staffRes.data ?? []).map(s => ({
    ...(s as Omit<RawKeyStaff, 'is_active'>),
    is_active: s.user_profile_id ? (isActiveByUserId.get(s.user_profile_id) ?? null) : null,
  }))

  return {
    keyStaff,
    admins,
    coordinators,
    error: null,
  }
}
