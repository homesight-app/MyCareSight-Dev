'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'

// ——— Shared types (imported by AgencyPeopleTab) ————————————————————————————

export interface RawKeyStaff {
  id: string
  agency_id: string
  officer_role: string | null
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

  const supabase = createAdminClient()

  const [staffRes, adminsRes, coordsRes] = await Promise.all([
    supabase
      .from('agency_key_staff')
      .select('id, agency_id, officer_role, full_legal_name, telephone, email, ownership_percentage, user_profile_id, status')
      .eq('agency_id', agencyId)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    supabase
      .from('agency_admins')
      .select('id, user_id, contact_name, contact_email, contact_phone, status')
      .eq('agency_id', agencyId)
      .order('contact_name', { ascending: true }),
    supabase
      .from('care_coordinators')
      .select('id, user_id, first_name, last_name, email, status')
      .eq('agency_id', agencyId)
      .order('first_name', { ascending: true }),
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
