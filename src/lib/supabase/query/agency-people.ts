import type { Supabase } from '../types'

export function getAgencyKeyStaff(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_key_staff')
    .select('id, agency_id, officer_role, officer_roles, full_legal_name, telephone, email, ownership_percentage, user_profile_id, status')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
}

export function getAgencyAdmins(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_admins')
    .select('id, user_id, contact_name, contact_email, contact_phone, status')
    .eq('agency_id', agencyId)
    .order('contact_name', { ascending: true })
}

export function getAgencyCareCoordinators(supabase: Supabase, agencyId: string) {
  return supabase
    .from('care_coordinators')
    .select('id, user_id, first_name, last_name, email, status')
    .eq('agency_id', agencyId)
    .order('first_name', { ascending: true })
}
