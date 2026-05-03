import type { Supabase } from '../types'

export async function getAgencyById(supabase: Supabase, agencyId: string) {
  return supabase.from('agencies').select('*').eq('id', agencyId).single()
}

export async function insertAgency(supabase: Supabase, payload: Record<string, unknown>) {
  return supabase.from('agencies').insert(payload).select('id').single()
}

export async function updateClientCompanyAndAgency(
  supabase: Supabase,
  adminId: string,
  updates: { company_name: string; agency_id?: string }
) {
  return supabase.from('agency_admins').update(updates).eq('id', adminId)
}

/** Same payload for many `agency_admins.id` rows — one UPDATE ... WHERE id IN (...). */
export async function updateClientCompanyAndAgencyForIds(
  supabase: Supabase,
  adminIds: string[],
  updates: { company_name: string; agency_id?: string | null }
) {
  if (adminIds.length === 0) return { data: null, error: null }
  return supabase.from('agency_admins').update(updates).in('id', adminIds)
}

export async function getAgenciesExceptId(supabase: Supabase, excludeId: string) {
  return supabase.from('agencies').select('id, agency_admin_ids').neq('id', excludeId)
}

export async function updateAgencyAdminIds(supabase: Supabase, agencyId: string, agencyAdminIds: string[]) {
  return supabase
    .from('agencies')
    .update({ agency_admin_ids: agencyAdminIds, updated_at: new Date().toISOString() })
    .eq('id', agencyId)
}

export async function updateAgencyById(supabase: Supabase, id: string, payload: Record<string, unknown>) {
  return supabase.from('agencies').update(payload).eq('id', id)
}

export async function updateClientClearAgency(supabase: Supabase, adminId: string) {
  return supabase.from('agency_admins').update({ company_name: '', agency_id: null }).eq('id', adminId)
}

export async function updateClientClearAgencyForIds(supabase: Supabase, adminIds: string[]) {
  if (adminIds.length === 0) return { data: null, error: null }
  return supabase
    .from('agency_admins')
    .update({ company_name: '', agency_id: null })
    .in('id', adminIds)
}

export async function getClientByCompanyOwnerId(supabase: Supabase, companyOwnerId: string) {
  return supabase.from('agency_admins').select('id').eq('user_id', companyOwnerId).maybeSingle()
}

/** Agency admin id and agency_id by auth user id (for staff creation). */
export async function getClientByCompanyOwnerIdWithAgency(supabase: Supabase, companyOwnerId: string) {
  return supabase.from('agency_admins').select('id, agency_id').eq('user_id', companyOwnerId).single()
}

/** One company-owner auth user id for an agency (for coordinators / legacy owner_id scoping). */
export async function getRepresentativeOwnerUserIdForAgency(supabase: Supabase, agencyId: string) {
  const { data, error } = await supabase
    .from('agency_admins')
    .select('company_owner_id, user_id')
    .eq('agency_id', agencyId)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const uid = data?.company_owner_id ?? data?.user_id ?? null
  return { data: uid, error }
}

export async function getAgencyNameById(supabase: Supabase, agencyId: string) {
  return supabase.from('agencies').select('name').eq('id', agencyId).single()
}

/** Full agency admin row by id. */
export async function getClientById(supabase: Supabase, adminId: string) {
  return supabase.from('agency_admins').select('*').eq('id', adminId).single()
}

export async function updateClientById(supabase: Supabase, adminId: string, data: Record<string, unknown>) {
  return supabase.from('agency_admins').update(data).eq('id', adminId)
}

export async function getAgencyByAdminId(supabase: Supabase, adminId: string) {
  return supabase.from('agencies').select('id').contains('agency_admin_ids', [adminId]).maybeSingle()
}

export async function getAgencyByAdminIdFull(supabase: Supabase, adminId: string) {
  return supabase.from('agencies').select('*').contains('agency_admin_ids', [adminId]).maybeSingle()
}

export async function updateClientAgencyId(supabase: Supabase, adminId: string, agencyId: string) {
  return supabase.from('agency_admins').update({ agency_id: agencyId }).eq('id', adminId)
}

export async function insertAgencyWithAdmin(supabase: Supabase, payload: Record<string, unknown>) {
  return supabase.from('agencies').insert(payload).select('id').single()
}

export async function updateClientCompanyName(supabase: Supabase, adminId: string, companyName: string) {
  return supabase.from('agency_admins').update({ company_name: companyName }).eq('id', adminId)
}

export async function getAgenciesOrdered(supabase: Supabase) {
  return supabase.from('agencies').select('*').order('created_at', { ascending: false })
}

export async function getAgenciesForBilling(supabase: Supabase) {
  return supabase
    .from('agencies')
    .select('id, name, agency_admin_ids')
    .order('name', { ascending: true })
}

export async function getAgenciesIdName(supabase: Supabase) {
  return supabase.from('agencies').select('id, name').order('name', { ascending: true })
}

export async function getClientsWithCompanyOwner(supabase: Supabase) {
  return supabase
    .from('agency_admins')
    .select('id, contact_name, contact_email')
    .not('user_id', 'is', null)
    .order('contact_name', { ascending: true })
}

/** Agency admins not currently assigned to any agency — used for "add admin" dropdowns. */
export async function getUnassignedAgencyAdmins(supabase: Supabase) {
  return supabase
    .from('agency_admins')
    .select('id, contact_name, contact_email')
    .is('agency_id', null)
    .not('user_id', 'is', null)
    .order('contact_name', { ascending: true })
}

/** Rows by primary key — includes admins without user_id (still listed on agencies). */
export async function getAgencyAdminsByIds(supabase: Supabase, ids: string[]) {
  const uniq = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)))
  if (uniq.length === 0) return { data: [] as { id: string; contact_name: string | null; contact_email: string | null }[], error: null }
  return supabase.from('agency_admins').select('id, contact_name, contact_email').in('id', uniq)
}

export async function getAllClientsOrdered(supabase: Supabase) {
  return supabase.from('agency_admins').select('*').order('created_at', { ascending: false })
}

/** Escape `%` / `_` for Postgres ILIKE patterns. */
function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ')
}

export type AgencyAdminListFilters = {
  search?: string
  /** UI values: `'All Status'` skips; otherwise matches `agency_admins.status` case-insensitively. */
  status?: string
  /** UI: `'All Experts'` skips; otherwise `expert_id` must equal this (auth user id of expert). */
  expertUserId?: string
  /** Deprecated: state filter removed after dropping `client_states`. */
  state?: string
}

/** Filtered agency admin list for admin UI (ILIKE search + optional status / expert / state). */
export async function getAgencyAdminsFiltered(supabase: Supabase, filters: AgencyAdminListFilters) {
  let qb = supabase.from('agency_admins').select('*').order('created_at', { ascending: false })

  const search = filters.search?.trim()
  if (search) {
    const p = `%${escapeIlikePattern(search)}%`
    qb = qb.or(`company_name.ilike.${p},contact_name.ilike.${p},contact_email.ilike.${p}`)
  }

  if (filters.status && filters.status !== 'All Status') {
    qb = qb.eq('status', filters.status.trim().toLowerCase())
  }

  if (filters.expertUserId && filters.expertUserId !== 'All Experts') {
    qb = qb.eq('expert_id', filters.expertUserId)
  }

  // state filter intentionally ignored (legacy `client_states` removed)

  return qb
}

export async function getClientsByIds(supabase: Supabase, adminIds: string[], select = 'id, company_name') {
  if (adminIds.length === 0) return { data: [], error: null }
  return supabase.from('agency_admins').select(select).in('id', adminIds)
}

export async function getClientsByCompanyOwnerIds(
  supabase: Supabase,
  companyOwnerIds: string[],
  select = 'user_id, company_name, agency_id'
) {
  if (companyOwnerIds.length === 0) return { data: [], error: null }
  return supabase.from('agency_admins').select(select).in('user_id', companyOwnerIds)
}
