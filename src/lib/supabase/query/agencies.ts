import type { Supabase } from '../types'

const AGENCY_COLS = 'id, name, created_at, updated_at, business_type, tax_id, primary_license_number, website, physical_street_address, physical_city, physical_state, physical_zip_code, same_as_physical, mailing_street_address, mailing_city, mailing_state, mailing_zip_code, agency_admin_ids, dba_name, hours_of_operation, fax_number, date_of_formation, npi, onboarding_status, state_specific_data, phone_number, email, region_service_area, is_on_call, previously_licensed, prev_license_closed_date, status, legal_entity_name, entity_type, state_of_incorporation, date_of_incorporation, licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip, licensed_same_as_physical, plan_id, primary_contact_first_name, primary_contact_last_name'

export async function getAgencyById(supabase: Supabase, agencyId: string) {
  return supabase.from('agencies').select(AGENCY_COLS).eq('id', agencyId).single()
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


export async function getAgencyNameById(supabase: Supabase, agencyId: string) {
  return supabase.from('agencies').select('name').eq('id', agencyId).single()
}

export async function getAgenciesByIds(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return { data: [] as { id: string; name: string }[], error: null }
  return supabase.from('agencies').select('id, name').in('id', ids)
}

/** Full agency admin row by id. */
export async function getClientById(supabase: Supabase, adminId: string) {
  return supabase.from('agency_admins').select('*').eq('id', adminId).single()
}

export async function updateClientById(supabase: Supabase, adminId: string, data: Record<string, unknown>) {
  return supabase.from('agency_admins').update(data).eq('id', adminId)
}

export async function getAgencyByAdminId(supabase: Supabase, adminId: string) {
  const { data: aa, error } = await supabase
    .from('agency_admins')
    .select('agency_id')
    .eq('id', adminId)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !aa?.agency_id) return { data: null, error }
  return supabase.from('agencies').select('id').eq('id', aa.agency_id).maybeSingle()
}

export async function getAgencyByAdminIdFull(supabase: Supabase, adminId: string) {
  const { data: aa, error } = await supabase
    .from('agency_admins')
    .select('agency_id')
    .eq('id', adminId)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !aa?.agency_id) return { data: null, error }
  return supabase.from('agencies').select(AGENCY_COLS).eq('id', aa.agency_id).maybeSingle()
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
  return supabase.from('agencies').select(AGENCY_COLS).order('created_at', { ascending: false })
}

export interface GetAgenciesPaginatedOpts {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
}

export async function getAgenciesFilteredPaginated(
  supabase: Supabase,
  opts?: GetAgenciesPaginatedOpts
) {
  const page     = opts?.page     ?? 0
  const pageSize = opts?.pageSize ?? 50
  const from     = page * pageSize
  const to       = from + pageSize - 1

  const sortCol = opts?.sortKey === 'created' ? 'created_at'
                : opts?.sortKey === 'status'  ? 'status'
                : 'name'
  const ascending = (opts?.sortDir ?? 'asc') === 'asc'

  let dataQuery = supabase
    .from('agencies')
    .select('*')
    .order(sortCol, { ascending })
    .range(from, to)

  let countQuery = supabase
    .from('agencies')
    .select('id', { count: 'exact', head: true })

  if (opts?.search?.trim()) {
    const term = `%${opts.search.trim()}%`
    dataQuery  = dataQuery.ilike('name', term)
    countQuery = countQuery.ilike('name', term)
  }

  if (opts?.status && opts.status !== 'all') {
    dataQuery  = dataQuery.eq('status', opts.status)
    countQuery = countQuery.eq('status', opts.status)
  }

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery])
  return {
    data:  dataResult.data  ?? [],
    count: countResult.count ?? 0,
    error: dataResult.error ?? countResult.error,
  }
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

export async function getAllClientsOrderedPaginated(supabase: Supabase, page: number, pageSize: number) {
  const from = page * pageSize
  const to   = from + pageSize - 1
  const [dataResult, countResult] = await Promise.all([
    supabase.from('agency_admins').select('*').order('created_at', { ascending: false }).range(from, to),
    supabase.from('agency_admins').select('id', { count: 'exact', head: true }),
  ])
  return {
    data:  dataResult.data  ?? [],
    count: countResult.count ?? 0,
    error: dataResult.error ?? countResult.error,
  }
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

/** Get the payroll configuration for an agency. Returns null if not yet configured. */
export async function getAgencyConfiguration(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_configurations')
    .select('*')
    .eq('agency_id', agencyId)
    .maybeSingle()
}

/** Create or update the payroll configuration for an agency (upsert on agency_id). */
export async function upsertAgencyConfiguration(
  supabase: Supabase,
  agencyId: string,
  payload: Record<string, unknown>
) {
  return supabase
    .from('agency_configurations')
    .upsert(
      { ...payload, agency_id: agencyId, updated_at: new Date().toISOString() },
      { onConflict: 'agency_id' }
    )
    .select()
    .single()
}

export async function getAgencyNotes(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_notes')
    .select('id, agency_id, author_id, content, note_type, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
}

export async function getAgencyDocuments(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agency_documents')
    .select('id, agency_id, document_name, file_url, file_name, document_type, description, uploaded_by, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
}

export async function insertAgencyDocument(
  supabase: Supabase,
  data: {
    agency_id: string
    document_name: string
    file_url: string
    file_name?: string | null
    document_type?: string | null
    description?: string | null
    uploaded_by: string
  }
) {
  return supabase.from('agency_documents').insert(data).select('id').single()
}

export async function deleteAgencyDocument(supabase: Supabase, docId: string) {
  return supabase.from('agency_documents').delete().eq('id', docId)
}

const BRANDING_COLS = 'logo_path, logo_icon_path, primary_color, sidebar_color'

export interface AgencyBrandingRow {
  logo_path: string | null
  logo_icon_path: string | null
  primary_color: string | null
  sidebar_color: string | null
}

export async function getAgencyBranding(supabase: Supabase, agencyId: string) {
  return supabase
    .from('agencies')
    .select(BRANDING_COLS)
    .eq('id', agencyId)
    .single()
}

export async function updateAgencyBrandingColors(
  supabase: Supabase,
  agencyId: string,
  payload: { primary_color: string; sidebar_color: string }
) {
  return supabase.from('agencies').update(payload).eq('id', agencyId)
}

export async function clearAgencyBranding(supabase: Supabase, agencyId: string) {
  return supabase.from('agencies').update({
    logo_path: null,
    logo_icon_path: null,
    primary_color: null,
    sidebar_color: null,
  }).eq('id', agencyId)
}
