import type { Supabase } from '../types'

export interface OnboardingToken {
  id: string
  agency_id: string
  token: string
  expires_at: string
  use_count: number
  created_by: string
  note: string | null
  created_at: string
}

export interface AgencyKeyStaff {
  id: string
  agency_id: string
  officer_role: string
  full_legal_name: string | null
  telephone: string | null
  email: string | null
  date_of_birth: string | null
  ssn_last4: string | null
  home_address_street: string | null
  home_address_city: string | null
  home_address_state: string | null
  home_address_zip: string | null
  date_of_hire: string | null
  is_licensed: boolean | null
  license_type: string | null
  ownership_percentage: string | null
  professional_license_number: string | null
  employment_type: string | null
  user_profile_id: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function getActiveOnboardingToken(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_onboarding_tokens')
    .select('*')
    .eq('agency_id', agencyId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

export async function getOnboardingTokenByValue(supabase: Supabase, tokenValue: string) {
  return supabase
    .from('agency_onboarding_tokens')
    .select('*')
    .eq('token', tokenValue)
    .maybeSingle()
}

export async function insertOnboardingToken(
  supabase: Supabase,
  payload: { agency_id: string; created_by: string; expires_at: string; note?: string | null }
) {
  return supabase
    .from('agency_onboarding_tokens')
    .insert(payload)
    .select('*')
    .single()
}

export async function expireTokensForAgency(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_onboarding_tokens')
    .update({ expires_at: new Date().toISOString() })
    .eq('agency_id', agencyId)
    .gt('expires_at', new Date().toISOString())
}

export async function incrementTokenUseCount(supabase: Supabase, tokenId: string, currentCount: number) {
  return supabase
    .from('agency_onboarding_tokens')
    .update({ use_count: currentCount + 1 })
    .eq('id', tokenId)
}

export async function getKeyStaffByAgencyId(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_key_staff')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
}

export async function insertKeyStaffMember(
  supabase: Supabase,
  agencyId: string,
  officerRole: string,
  payload: Record<string, unknown>
) {
  return supabase
    .from('agency_key_staff')
    .insert({ agency_id: agencyId, officer_role: officerRole, ...payload })
    .select('*')
    .single()
}

export async function upsertKeyStaffMember(
  supabase: Supabase,
  agencyId: string,
  officerRole: string,
  payload: Record<string, unknown>
) {
  const { data: existing } = await supabase
    .from('agency_key_staff')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('officer_role', officerRole)
    .eq('status', 'active')
    .maybeSingle()

  if (existing?.id) {
    return supabase
      .from('agency_key_staff')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single()
  }
  return supabase
    .from('agency_key_staff')
    .insert({ agency_id: agencyId, officer_role: officerRole, ...payload })
    .select('*')
    .single()
}

export async function updateKeyStaffById(supabase: Supabase, id: string, payload: Record<string, unknown>) {
  return supabase
    .from('agency_key_staff')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
}

export async function deactivateKeyStaffById(supabase: Supabase, id: string) {
  return supabase
    .from('agency_key_staff')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id)
}
