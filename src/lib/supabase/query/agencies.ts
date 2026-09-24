import sql from '@/db'

const AGENCY_COLS = `id, name, created_at, updated_at, business_type, tax_id, primary_license_number, website,
  physical_street_address, physical_city, physical_state, physical_zip_code, same_as_physical,
  mailing_street_address, mailing_city, mailing_state, mailing_zip_code, agency_admin_ids, dba_name,
  hours_of_operation, fax_number, date_of_formation, npi, onboarding_status, state_specific_data,
  phone_number, email, region_service_area, is_on_call, previously_licensed, prev_license_closed_date,
  status, legal_entity_name, entity_type, state_of_incorporation, date_of_incorporation,
  licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip,
  licensed_same_as_physical, plan_id, primary_contact_first_name, primary_contact_last_name`

export async function getAgencyById(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, name, created_at, updated_at, business_type, tax_id, primary_license_number, website,
        physical_street_address, physical_city, physical_state, physical_zip_code, same_as_physical,
        mailing_street_address, mailing_city, mailing_state, mailing_zip_code, agency_admin_ids, dba_name,
        hours_of_operation, fax_number, date_of_formation, npi, onboarding_status, state_specific_data,
        phone_number, email, region_service_area, is_on_call, previously_licensed, prev_license_closed_date,
        status, legal_entity_name, entity_type, state_of_incorporation, date_of_incorporation,
        licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip,
        licensed_same_as_physical, plan_id, primary_contact_first_name, primary_contact_last_name
      FROM agencies WHERE id = ${agencyId}
    `
    if (!rows[0]) throw new Error('Row not found')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertAgency(payload: Record<string, unknown>) {
  try {
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    const rows = await sql`INSERT INTO agencies ${sql(payload, ...keys)} RETURNING id`
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateClientCompanyAndAgency(
  adminId: string,
  updates: { company_name: string; agency_id?: string }
) {
  try {
    const keys = Object.keys(updates) as (keyof typeof updates)[]
    await sql`UPDATE agency_admins SET ${sql(updates, ...keys)} WHERE id = ${adminId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Same payload for many `agency_admins.id` rows — one UPDATE ... WHERE id IN (...). */
export async function updateClientCompanyAndAgencyForIds(
  adminIds: string[],
  updates: { company_name: string; agency_id?: string | null }
) {
  if (adminIds.length === 0) return { data: null, error: null }
  try {
    const keys = Object.keys(updates) as (keyof typeof updates)[]
    await sql`UPDATE agency_admins SET ${sql(updates, ...keys)} WHERE id IN ${sql(adminIds)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgenciesExceptId(excludeId: string) {
  try {
    const rows = await sql`SELECT id, agency_admin_ids FROM agencies WHERE id != ${excludeId}`
    return { data: rows as unknown as { id: string; agency_admin_ids: string[] }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateAgencyAdminIds(agencyId: string, agencyAdminIds: string[]) {
  try {
    await sql`UPDATE agencies SET agency_admin_ids = ${agencyAdminIds}, updated_at = ${new Date().toISOString()} WHERE id = ${agencyId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateAgencyById(id: string, payload: Record<string, unknown>) {
  try {
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    await sql`UPDATE agencies SET ${sql(payload, ...keys)} WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateClientClearAgency(adminId: string) {
  try {
    await sql`UPDATE agency_admins SET company_name = '', agency_id = NULL WHERE id = ${adminId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateClientClearAgencyForIds(adminIds: string[]) {
  if (adminIds.length === 0) return { data: null, error: null }
  try {
    await sql`UPDATE agency_admins SET company_name = '', agency_id = NULL WHERE id IN ${sql(adminIds)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getClientByCompanyOwnerId(companyOwnerId: string) {
  try {
    const rows = await sql`SELECT id FROM agency_admins WHERE user_id = ${companyOwnerId} LIMIT 1`
    return { data: (rows[0] ?? null) as { id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgencyNameById(agencyId: string) {
  try {
    const rows = await sql`SELECT name FROM agencies WHERE id = ${agencyId}`
    if (!rows[0]) throw new Error('Row not found')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgenciesByIds(ids: string[]) {
  if (ids.length === 0) return { data: [] as { id: string; name: string }[], error: null }
  try {
    const rows = await sql`SELECT id, name FROM agencies WHERE id IN ${sql(ids)}`
    return { data: rows as unknown as { id: string; name: string }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Full agency admin row by id. */
export async function getClientById(adminId: string) {
  try {
    const rows = await sql`SELECT * FROM agency_admins WHERE id = ${adminId}`
    if (!rows[0]) throw new Error('Row not found')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateClientById(adminId: string, data: Record<string, unknown>) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    await sql`UPDATE agency_admins SET ${sql(data, ...keys)} WHERE id = ${adminId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgencyByAdminId(adminId: string) {
  try {
    const aaRows = await sql`
      SELECT agency_id FROM agency_admins
      WHERE id = ${adminId} AND status = 'active'
      LIMIT 1
    `
    const aa = aaRows[0] as any | undefined
    if (!aa?.agency_id) return { data: null, error: null }
    const rows = await sql`SELECT id FROM agencies WHERE id = ${aa.agency_id} LIMIT 1`
    return { data: (rows[0] ?? null) as { id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgencyByAdminIdFull(adminId: string) {
  try {
    const aaRows = await sql`
      SELECT agency_id FROM agency_admins
      WHERE id = ${adminId} AND status = 'active'
      LIMIT 1
    `
    const aa = aaRows[0] as any | undefined
    if (!aa?.agency_id) return { data: null, error: null }
    const rows = await sql`
      SELECT id, name, created_at, updated_at, business_type, tax_id, primary_license_number, website,
        physical_street_address, physical_city, physical_state, physical_zip_code, same_as_physical,
        mailing_street_address, mailing_city, mailing_state, mailing_zip_code, agency_admin_ids, dba_name,
        hours_of_operation, fax_number, date_of_formation, npi, onboarding_status, state_specific_data,
        phone_number, email, region_service_area, is_on_call, previously_licensed, prev_license_closed_date,
        status, legal_entity_name, entity_type, state_of_incorporation, date_of_incorporation,
        licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip,
        licensed_same_as_physical, plan_id, primary_contact_first_name, primary_contact_last_name
      FROM agencies WHERE id = ${aa.agency_id}
      LIMIT 1
    `
    return { data: (rows[0] as any ?? null), error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateClientAgencyId(adminId: string, agencyId: string) {
  try {
    await sql`UPDATE agency_admins SET agency_id = ${agencyId} WHERE id = ${adminId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertAgencyWithAdmin(payload: Record<string, unknown>) {
  try {
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    const rows = await sql`INSERT INTO agencies ${sql(payload, ...keys)} RETURNING id`
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateClientCompanyName(adminId: string, companyName: string) {
  try {
    await sql`UPDATE agency_admins SET company_name = ${companyName} WHERE id = ${adminId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgenciesOrdered() {
  try {
    const rows = await sql`
      SELECT id, name, created_at, updated_at, business_type, tax_id, primary_license_number, website,
        physical_street_address, physical_city, physical_state, physical_zip_code, same_as_physical,
        mailing_street_address, mailing_city, mailing_state, mailing_zip_code, agency_admin_ids, dba_name,
        hours_of_operation, fax_number, date_of_formation, npi, onboarding_status, state_specific_data,
        phone_number, email, region_service_area, is_on_call, previously_licensed, prev_license_closed_date,
        status, legal_entity_name, entity_type, state_of_incorporation, date_of_incorporation,
        licensed_office_street, licensed_office_city, licensed_office_state, licensed_office_zip,
        licensed_same_as_physical, plan_id, primary_contact_first_name, primary_contact_last_name
      FROM agencies ORDER BY created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export interface GetAgenciesPaginatedOpts {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
}

export async function getAgenciesFilteredPaginated(opts?: GetAgenciesPaginatedOpts) {
  const page     = opts?.page     ?? 0
  const pageSize = opts?.pageSize ?? 50
  const from     = page * pageSize

  const sortCol = opts?.sortKey === 'created' ? sql`created_at`
                : opts?.sortKey === 'status'  ? sql`status`
                : sql`name`
  const sortDir = (opts?.sortDir ?? 'asc') === 'asc' ? sql`ASC` : sql`DESC`

  const searchCond = opts?.search?.trim()
    ? sql`AND name ILIKE ${'%' + opts.search.trim() + '%'}`
    : sql``
  const statusCond = opts?.status && opts.status !== 'all'
    ? sql`AND status = ${opts.status}`
    : sql``

  try {
    const [dataRows, countRows] = await Promise.all([
      sql`SELECT * FROM agencies WHERE TRUE ${searchCond} ${statusCond} ORDER BY ${sortCol} ${sortDir} LIMIT ${pageSize} OFFSET ${from}`,
      sql`SELECT COUNT(*)::int AS count FROM agencies WHERE TRUE ${searchCond} ${statusCond}`,
    ])
    return {
      data:  (dataRows as unknown as any[]) ?? [],
      count: (countRows[0] as any | undefined)?.count ?? 0,
      error: null,
    }
  } catch (err) {
    return {
      data:  [],
      count: 0,
      error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' },
    }
  }
}

export async function getAgenciesForBilling() {
  try {
    const rows = await sql`SELECT id, name, agency_admin_ids FROM agencies ORDER BY name ASC`
    return { data: rows as unknown as { id: string; name: string; agency_admin_ids: string[] }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAllAgencyAdminIds() {
  try {
    const rows = await sql`SELECT agency_admin_ids FROM agencies`
    return { data: rows as unknown as { agency_admin_ids: string[] | string | null }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgenciesIdName() {
  try {
    const rows = await sql`SELECT id, name FROM agencies ORDER BY name ASC`
    return { data: rows as unknown as { id: string; name: string }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getClientsWithCompanyOwner() {
  try {
    const rows = await sql`
      SELECT id, contact_name, contact_email FROM agency_admins
      WHERE user_id IS NOT NULL
      ORDER BY contact_name ASC
    `
    return { data: rows as unknown as { id: string; contact_name: string | null; contact_email: string | null }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Agency admins not currently assigned to any agency — used for "add admin" dropdowns. */
export async function getUnassignedAgencyAdmins() {
  try {
    const rows = await sql`
      SELECT id, contact_name, contact_email FROM agency_admins
      WHERE agency_id IS NULL AND user_id IS NOT NULL
      ORDER BY contact_name ASC
    `
    return { data: rows as unknown as { id: string; contact_name: string | null; contact_email: string | null }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Rows by primary key — includes admins without user_id (still listed on agencies). */
export async function getAgencyAdminsByIds(ids: string[]) {
  const uniq = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)))
  if (uniq.length === 0) return { data: [] as { id: string; contact_name: string | null; contact_email: string | null }[], error: null }
  try {
    const rows = await sql`SELECT id, contact_name, contact_email FROM agency_admins WHERE id IN ${sql(uniq)}`
    return { data: rows as unknown as { id: string; contact_name: string | null; contact_email: string | null }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAllClientsOrdered() {
  try {
    const rows = await sql`SELECT * FROM agency_admins ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAllClientsOrderedPaginated(page: number, pageSize: number) {
  const from = page * pageSize
  try {
    const [dataRows, countRows] = await Promise.all([
      sql`SELECT * FROM agency_admins ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${from}`,
      sql`SELECT COUNT(*)::int AS count FROM agency_admins`,
    ])
    return {
      data:  (dataRows as unknown as any[]) ?? [],
      count: (countRows[0] as any | undefined)?.count ?? 0,
      error: null,
    }
  } catch (err) {
    return {
      data:  [],
      count: 0,
      error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' },
    }
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
export async function getAgencyAdminsFiltered(filters: AgencyAdminListFilters) {
  try {
    const search = filters.search?.trim()
    const searchCond = search
      ? sql`AND (company_name ILIKE ${'%' + escapeIlikePattern(search) + '%'} OR contact_name ILIKE ${'%' + escapeIlikePattern(search) + '%'} OR contact_email ILIKE ${'%' + escapeIlikePattern(search) + '%'})`
      : sql``

    const statusCond = filters.status && filters.status !== 'All Status'
      ? sql`AND status = ${filters.status.trim().toLowerCase()}`
      : sql``

    const expertCond = filters.expertUserId && filters.expertUserId !== 'All Experts'
      ? sql`AND expert_id = ${filters.expertUserId}`
      : sql``

    // state filter intentionally ignored (legacy `client_states` removed)

    const rows = await sql`
      SELECT * FROM agency_admins
      WHERE TRUE ${searchCond} ${statusCond} ${expertCond}
      ORDER BY created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getClientsByIds(adminIds: string[], select = 'id, company_name') {
  if (adminIds.length === 0) return { data: [], error: null }
  try {
    // select is a trusted internal string — use sql.unsafe only for the column list
    const rows = await sql`SELECT ${sql.unsafe(select)} FROM agency_admins WHERE id IN ${sql(adminIds)}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getClientsByCompanyOwnerIds(
  companyOwnerIds: string[],
  select = 'user_id, company_name, agency_id'
) {
  if (companyOwnerIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT ${sql.unsafe(select)} FROM agency_admins WHERE user_id IN ${sql(companyOwnerIds)}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Admin user-directory company mappings for owner profile ids. */
export async function getAgencyAdminCompanyMappingsByOwnerIds(ownerUserIds: string[]) {
  if (ownerUserIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT user_id, company_owner_id, company_name, agency_id
      FROM agency_admins
      WHERE user_id = ANY(${ownerUserIds}::uuid[])
         OR company_owner_id = ANY(${ownerUserIds}::uuid[])
    `
    return { data: rows as unknown as {
      user_id: string | null
      company_owner_id: string | null
      company_name: string | null
      agency_id: string | null
    }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get the payroll configuration for an agency. Returns null if not yet configured. */
export async function getAgencyConfiguration(agencyId: string) {
  try {
    const rows = await sql`SELECT * FROM agency_configurations WHERE agency_id = ${agencyId} LIMIT 1`
    return { data: (rows[0] as any ?? null), error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Create or update the payroll configuration for an agency (upsert on agency_id). */
export async function upsertAgencyConfiguration(
  agencyId: string,
  payload: Record<string, unknown>
) {
  try {
    const merged = { ...payload, agency_id: agencyId, updated_at: new Date().toISOString() }
    const keys = Object.keys(merged) as (keyof typeof merged)[]
    const rows = await sql`
      INSERT INTO agency_configurations ${sql(merged, ...keys)}
      ON CONFLICT (agency_id) DO UPDATE SET ${sql(merged, ...keys)}
      RETURNING *
    `
    return { data: (rows as unknown as any[])[0] ?? null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgencyNotes(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, agency_id, author_id, content, note_type, created_at
      FROM agency_notes
      WHERE agency_id = ${agencyId}
      ORDER BY created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getAgencyDocuments(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, agency_id, document_name, file_url, file_name, document_type, description, uploaded_by, created_at
      FROM agency_documents
      WHERE agency_id = ${agencyId}
      ORDER BY created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertAgencyDocument(
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
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    const rows = await sql`INSERT INTO agency_documents ${sql(data, ...keys)} RETURNING id`
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function deleteAgencyDocument(docId: string) {
  try {
    await sql`DELETE FROM agency_documents WHERE id = ${docId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export interface AgencyBrandingRow {
  logo_path: string | null
  logo_icon_path: string | null
  primary_color: string | null
  sidebar_color: string | null
}

export async function getAgencyBranding(agencyId: string) {
  try {
    const rows = await sql`
      SELECT logo_path, logo_icon_path, primary_color, sidebar_color
      FROM agencies WHERE id = ${agencyId}
    `
    if (!rows[0]) throw new Error('Row not found')
    return { data: rows[0] as AgencyBrandingRow, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateAgencyBrandingColors(
  agencyId: string,
  payload: { primary_color: string; sidebar_color: string }
) {
  try {
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    await sql`UPDATE agencies SET ${sql(payload, ...keys)} WHERE id = ${agencyId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function clearAgencyBranding(agencyId: string) {
  try {
    await sql`
      UPDATE agencies
      SET logo_path = NULL, logo_icon_path = NULL, primary_color = NULL, sidebar_color = NULL
      WHERE id = ${agencyId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
