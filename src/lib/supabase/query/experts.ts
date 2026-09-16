import sql from '@/db'

type ExpertStateRow = {
  id: string
  expert_id: string
  state: string
}

const LICENSING_EXPERTS_COLUMNS = 'id, user_id, user_profile_id, first_name, last_name, email, phone, role, status, expertise, created_at, updated_at'
const AGENCY_ADMINS_COLUMNS = 'id, user_id, agency_id, expert_id, company_owner_id, company_name, contact_name, contact_email, contact_phone, status, start_date, business_type, tax_id, primary_license_number, website, physical_street_address, physical_city, physical_state, physical_zip_code, mailing_street_address, mailing_city, mailing_state, mailing_zip_code, created_at, updated_at'

/** RPC: create licensing expert (handles user + licensing_experts row). */
export async function rpcCreateLicensingExpert(
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
  try {
    const rows = await sql`SELECT create_licensing_expert(${params.p_first_name}, ${params.p_last_name}, ${params.p_email}, ${params.p_password}, ${params.p_phone ?? null}, ${params.p_expertise ?? null}, ${params.p_role ?? null}, ${params.p_status ?? null})`
    return { data: (rows as unknown as any[])[0] ?? null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get licensing_expert by id. */
export async function getLicensingExpertById(id: string) {
  try {
    const rows = await sql`SELECT ${sql.unsafe(LICENSING_EXPERTS_COLUMNS)} FROM licensing_experts WHERE id = ${id} LIMIT 1`
    if (!rows[0]) throw new Error('Not found')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Update licensing_expert by id. */
export async function updateLicensingExpertById(id: string, data: Record<string, unknown>) {
  try {
    const keys = Object.keys(data) as unknown as any[]
    await sql`UPDATE licensing_experts SET ${sql(data, ...keys)} WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get all licensing_experts ordered by created_at desc. */
export async function getLicensingExpertsOrdered() {
  try {
    const rows = await sql`SELECT ${sql.unsafe(LICENSING_EXPERTS_COLUMNS)} FROM licensing_experts ORDER BY created_at DESC LIMIT 500`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
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
export async function getLicensingExpertsFiltered(filters: LicensingExpertListFilters) {
  try {
    const search = filters.search?.trim()
    const searchFrag = search
      ? sql`AND (first_name ILIKE ${'%' + escapeIlikePattern(search) + '%'} OR last_name ILIKE ${'%' + escapeIlikePattern(search) + '%'} OR email ILIKE ${'%' + escapeIlikePattern(search) + '%'} OR expertise ILIKE ${'%' + escapeIlikePattern(search) + '%'})`
      : sql``

    const statusFrag = filters.status && filters.status !== 'All Status'
      ? sql`AND status = ${filters.status.trim().toLowerCase()}`
      : sql``

    // state filter intentionally ignored (legacy `expert_states` removed)

    const rows = await sql`
      SELECT ${sql.unsafe(LICENSING_EXPERTS_COLUMNS)} FROM licensing_experts
      WHERE 1=1 ${searchFrag} ${statusFrag}
      ORDER BY created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get licensing_experts by user_ids. */
export async function getLicensingExpertsByUserIds(userIds: string[]) {
  if (userIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT ${sql.unsafe(LICENSING_EXPERTS_COLUMNS)} FROM licensing_experts WHERE user_id IN ${sql(userIds)}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get licensing_experts by ids (e.g. id, user_id, first_name, last_name). */
export async function getLicensingExpertsByIds(ids: string[], select = 'id, user_id, first_name, last_name') {
  if (ids.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT ${sql.unsafe(select)} FROM licensing_experts WHERE id IN ${sql(ids)}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get licensing_experts active, ordered by first_name. */
export async function getLicensingExpertsActive() {
  try {
    const rows = await sql`
      SELECT ${sql.unsafe(LICENSING_EXPERTS_COLUMNS)} FROM licensing_experts
      WHERE status = 'active'
      ORDER BY first_name ASC
      LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get expert_states by expert_id. */
export async function getExpertStatesByExpertId(_expertId: string) {
  return { data: [] as unknown as ExpertStateRow[], error: null }
}

/** Get expert_states by expert ids. */
export async function getExpertStatesByExpertIds(_expertIds: string[]) {
  return { data: [] as unknown as ExpertStateRow[], error: null }
}

/** Get licensing_expert by user_id. */
export async function getLicensingExpertByUserId(userId: string) {
  try {
    const rows = await sql`SELECT ${sql.unsafe(LICENSING_EXPERTS_COLUMNS)} FROM licensing_experts WHERE user_id = ${userId} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Agency admin rows assigned to a licensing expert (by auth user id of the expert). */
export async function getClientsByExpertId(expertUserId: string) {
  try {
    const { data: le, error: leErr } = await getLicensingExpertByUserId(expertUserId)
    if (leErr) return { data: null, error: leErr }
    if (!le?.id) return { data: [], error: null }
    const rows = await sql`
      SELECT ${sql.unsafe(AGENCY_ADMINS_COLUMNS)} FROM agency_admins
      WHERE expert_id = ${le.id}
      ORDER BY company_name ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Rows per licensing_expert.id (primary key), for admin counts. */
export async function getClientsByExpertIds(expertIds: string[]) {
  if (expertIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT expert_id FROM agency_admins WHERE expert_id IN ${sql(expertIds)}`
    return { data: rows as unknown as { expert_id: string }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
