import type { Supabase } from '../types'

type ExpertStateRow = {
  id: string
  expert_id: string
  state: string
}

/** RPC: create licensing expert (handles user + licensing_experts row). */
export async function rpcCreateLicensingExpert(
  supabase: Supabase,
  params: {
    p_first_name: string
    p_last_name: string
    p_email: string
    p_password: string
    p_phone?: string | null
    p_expertise?: string | null
    p_role?: string
    p_status?: string
  }
) {
  return supabase.rpc('create_licensing_expert', params)
}

const LICENSING_EXPERTS_COLUMNS = 'id, user_id, first_name, last_name, email, phone, role, status, expertise, created_at, updated_at'
const AGENCY_ADMINS_COLUMNS = 'id, user_id, agency_id, expert_id, company_owner_id, company_name, contact_name, contact_email, contact_phone, status, start_date, business_type, tax_id, primary_license_number, website, physical_street_address, physical_city, physical_state, physical_zip_code, mailing_street_address, mailing_city, mailing_state, mailing_zip_code, created_at, updated_at'

/** Get licensing_expert by id. */
export async function getLicensingExpertById(supabase: Supabase, id: string) {
  return supabase.from('licensing_experts').select(LICENSING_EXPERTS_COLUMNS).eq('id', id).single()
}

/** Update licensing_expert by id. */
export async function updateLicensingExpertById(
  supabase: Supabase,
  id: string,
  data: Record<string, unknown>
) {
  return supabase.from('licensing_experts').update(data).eq('id', id)
}

/** Get all licensing_experts ordered by created_at desc. */
export async function getLicensingExpertsOrdered(supabase: Supabase) {
  return supabase.from('licensing_experts').select(LICENSING_EXPERTS_COLUMNS).order('created_at', { ascending: false }).limit(500)
}

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ')
}

export type LicensingExpertListFilters = {
  search?: string
  /** `'All Status'` skips; otherwise matches `status` (lowercased). */
  status?: string
  /** Deprecated: state filter removed after dropping `expert_states`. */
  state?: string
}

/** Filtered licensing experts for admin UI. */
export async function getLicensingExpertsFiltered(supabase: Supabase, filters: LicensingExpertListFilters) {
  let qb = supabase.from('licensing_experts').select(LICENSING_EXPERTS_COLUMNS).order('created_at', { ascending: false })

  const search = filters.search?.trim()
  if (search) {
    const p = `%${escapeIlikePattern(search)}%`
    qb = qb.or(`first_name.ilike.${p},last_name.ilike.${p},email.ilike.${p},expertise.ilike.${p}`)
  }

  if (filters.status && filters.status !== 'All Status') {
    qb = qb.eq('status', filters.status.trim().toLowerCase())
  }

  // state filter intentionally ignored (legacy `expert_states` removed)

  return qb
}

/** Get licensing_experts by user_ids. */
export async function getLicensingExpertsByUserIds(supabase: Supabase, userIds: string[]) {
  if (userIds.length === 0) return { data: [], error: null }
  return supabase.from('licensing_experts').select(LICENSING_EXPERTS_COLUMNS).in('user_id', userIds)
}

/** Get licensing_experts by ids (e.g. id, user_id, first_name, last_name). */
export async function getLicensingExpertsByIds(
  supabase: Supabase,
  ids: string[],
  select = 'id, user_id, first_name, last_name'
) {
  if (ids.length === 0) return { data: [], error: null }
  return supabase.from('licensing_experts').select(select).in('id', ids)
}

/** Get licensing_experts active, ordered by first_name. */
export async function getLicensingExpertsActive(supabase: Supabase) {
  return supabase
    .from('licensing_experts')
    .select(LICENSING_EXPERTS_COLUMNS)
    .eq('status', 'active')
    .order('first_name', { ascending: true })
}

/** Get expert_states by expert_id. */
export async function getExpertStatesByExpertId(supabase: Supabase, expertId: string) {
  const _supabase = supabase
  const _expertId = expertId
  return { data: [] as ExpertStateRow[], error: null }
}

/** Get expert_states by expert ids. */
export async function getExpertStatesByExpertIds(supabase: Supabase, expertIds: string[]) {
  const _supabase = supabase
  const _expertIds = expertIds
  return { data: [] as ExpertStateRow[], error: null }
}

/** Get licensing_expert by user_id. */
export async function getLicensingExpertByUserId(supabase: Supabase, userId: string) {
  return supabase.from('licensing_experts').select(LICENSING_EXPERTS_COLUMNS).eq('user_id', userId).maybeSingle()
}

/** Agency admin rows assigned to a licensing expert (by auth user id of the expert). */
export async function getClientsByExpertId(supabase: Supabase, expertUserId: string) {
  const { data: le, error: leErr } = await getLicensingExpertByUserId(supabase, expertUserId)
  if (leErr) return { data: null, error: leErr }
  if (!le?.id) return { data: [], error: null }
  return supabase
    .from('agency_admins')
    .select(AGENCY_ADMINS_COLUMNS)
    .eq('expert_id', le.id)
    .order('company_name', { ascending: true })
}

/** Rows per licensing_expert.id (primary key), for admin counts. */
export async function getClientsByExpertIds(supabase: Supabase, expertIds: string[]) {
  if (expertIds.length === 0) return { data: [], error: null }
  return supabase.from('agency_admins').select('expert_id').in('expert_id', expertIds)
}
