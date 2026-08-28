'use server'

import { createClient } from '@/lib/supabase/server'
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
}

export interface RawAdmin {
  id: string
  user_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  status: string | null
}

export interface RawCoordinator {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  email: string
  status: string
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

  const supabase = await createClient()

  const [staffRes, adminsRes, coordsRes] = await Promise.all([
    getAgencyKeyStaff(supabase, agencyId),
    getAgencyAdmins(supabase, agencyId),
    getAgencyCareCoordinators(supabase, agencyId),
  ])

  const err = staffRes.error || adminsRes.error || coordsRes.error
  if (err) return { keyStaff: [], admins: [], coordinators: [], error: err.message }

  return {
    keyStaff: (staffRes.data ?? []) as RawKeyStaff[],
    admins:   (adminsRes.data ?? []) as RawAdmin[],
    coordinators: (coordsRes.data ?? []) as RawCoordinator[],
    error: null,
  }
}
