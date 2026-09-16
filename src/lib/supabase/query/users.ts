import sql from '@/db'
import type { PatientDocument } from './patients'

const USER_PROFILE_COLS = 'id, email, full_name, role, created_at, updated_at, phone, job_title, department, work_location, start_date, agency_id, is_active, last_login_at'

export async function updateUserProfileUpdatedAt(userId: string) {
  try {
    await sql`UPDATE user_profiles SET updated_at = ${new Date().toISOString()} WHERE id = ${userId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getUserProfileEmail(userId: string) {
  try {
    const rows = await sql`SELECT email FROM user_profiles WHERE id = ${userId} LIMIT 1`
    if (!rows[0]) throw new Error('Not found')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function rpcUpdateUserPassword(userId: string, newPassword: string) {
  try {
    await sql`SELECT update_user_password(${userId}, ${newPassword})`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertClient(
  data: {
    user_id: string
    contact_name: string
    contact_email: string
    status: string
    agency_id?: string | null
  }
) {
  try {
    const payload = {
      user_id: data.user_id,
      company_owner_id: data.user_id,
      contact_name: data.contact_name,
      contact_email: data.contact_email,
      status: data.status,
      agency_id: data.agency_id ?? null,
    }
    await sql`INSERT INTO agency_admins ${sql(payload)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getStaffMemberByUserId(userId: string) {
  try {
    const rows = await sql`SELECT id, agency_id, user_id FROM caregiver_members WHERE user_id = ${userId} LIMIT 1`
    return { data: (rows[0] ?? null) as { id: string; agency_id: string; user_id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertStaffMember(
  data: {
    user_id: string
    company_owner_id: string | null
    agency_id?: string | null
    first_name: string
    last_name: string
    email: string
    role: string
    status: string
  }
) {
  try {
    await sql`INSERT INTO caregiver_members ${sql(data)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Insert staff member and return the created row. */
export async function insertStaffMemberReturning(data: Record<string, unknown>) {
  try {
    const keys = Object.keys(data) as unknown as any[]
    const rows = await sql`INSERT INTO caregiver_members ${sql(data, ...keys)} RETURNING *`
    if (!rows[0]) throw new Error('Insert returned no rows')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/**
 * Update staff member by id.
 * Treats an empty result as unknown as an error so callers still know the update did not apply.
 */
export async function updateStaffMember(staffId: string, data: Record<string, unknown>) {
  try {
    const keys = Object.keys(data) as unknown as any[]
    const rows = await sql`UPDATE caregiver_members SET ${sql(data, ...keys)} WHERE id = ${staffId} RETURNING id`
    if (!rows[0]) {
      throw new Error(
        'No rows were updated. If you are saving your own skills, apply the database migration that allows caregivers to update their own caregiver_members row, or ask an agency admin to update your profile.'
      )
    }
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Update user profile (full_name, role, updated_at). */
export async function updateUserProfile(
  userId: string,
  data: { full_name?: string; role?: string; updated_at?: string }
) {
  try {
    const keys = Object.keys(data) as unknown as any[]
    await sql`UPDATE user_profiles SET ${sql(data, ...keys)} WHERE id = ${userId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Update user profile by id with arbitrary fields. */
export async function updateUserProfileById(userId: string, data: Record<string, unknown>) {
  try {
    const keys = Object.keys(data) as unknown as any[]
    await sql`UPDATE user_profiles SET ${sql(data, ...keys)} WHERE id = ${userId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get licensing_expert id by user_id (for existence check). */
export async function getLicensingExpertIdByUserId(userId: string) {
  try {
    const rows = await sql`SELECT id FROM licensing_experts WHERE user_id = ${userId} LIMIT 1`
    return { data: (rows[0] ?? null) as { id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertLicensingExpert(
  data: {
    user_id: string
    first_name: string
    last_name: string
    email: string
    role: string
    status: string
  }
) {
  try {
    await sql`INSERT INTO licensing_experts ${sql(data)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getUserProfileByEmail(email: string) {
  try {
    const rows = await sql`SELECT id, role FROM user_profiles WHERE email = ${email} LIMIT 1`
    if (!rows[0]) throw new Error('Not found')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getCareCoordinatorByUserId(userId: string) {
  try {
    const rows = await sql`SELECT id, user_id, agency_id FROM care_coordinators WHERE user_id = ${userId} LIMIT 1`
    return { data: (rows[0] ?? null) as { id: string; user_id: string; agency_id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertCareCoordinator(
  data: { user_id: string; agency_id: string; first_name: string; last_name: string; email: string; status: string }
) {
  try {
    await sql`INSERT INTO care_coordinators ${sql(data)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get user profile by id (id, full_name, email). */
export async function getUserProfileById(userId: string) {
  try {
    const rows = await sql`SELECT id, full_name, email FROM user_profiles WHERE id = ${userId} LIMIT 1`
    if (!rows[0]) throw new Error('Not found')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get full user profile by id (all columns). */
export async function getUserProfileFull(userId: string) {
  try {
    const rows = await sql`SELECT * FROM user_profiles WHERE id = ${userId} LIMIT 1`
    if (!rows[0]) throw new Error('Not found')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get agency_id directly from user_profiles — works for all agency-scoped roles. */
export async function getAgencyIdFromProfile(userId: string) {
  try {
    const rows = await sql`SELECT agency_id FROM user_profiles WHERE id = ${userId} LIMIT 1`
    return { data: (rows[0] ?? null) as { agency_id: string | null } | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get staff members visible to an agency client (agency-wide with owner fallback). */
export async function getStaffMembersByAgencyOrCompanyOwner(
  clientId: string,
  agencyId: string | null,
  options?: { status?: string }
) {
  try {
    const statusFrag = options?.status ? sql`AND status = ${options.status}` : sql``
    let rows: any[]
    if (agencyId) {
      rows = await sql`
        SELECT * FROM caregiver_members
        WHERE (company_owner_id = ${clientId} OR agency_id = ${agencyId})
        ${statusFrag}
        ORDER BY created_at DESC
      `
    } else {
      rows = await sql`
        SELECT * FROM caregiver_members
        WHERE company_owner_id = ${clientId}
        ${statusFrag}
        ORDER BY created_at DESC
      `
    }
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get one staff member visible to an agency client (agency-wide with owner fallback). */
export async function getStaffMemberByIdWithAgencyOrCompanyOwner(
  staffId: string,
  clientId: string,
  agencyId: string | null
) {
  try {
    let rows: any[]
    if (agencyId) {
      rows = await sql`
        SELECT * FROM caregiver_members
        WHERE id = ${staffId}
          AND (company_owner_id = ${clientId} OR agency_id = ${agencyId})
        LIMIT 1
      `
    } else {
      rows = await sql`
        SELECT * FROM caregiver_members
        WHERE id = ${staffId}
          AND company_owner_id = ${clientId}
        LIMIT 1
      `
    }
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get staff members by agency_id (optional status filter), ordered by created_at desc. */
export async function getStaffMembersByAgencyId(agencyId: string, options?: { status?: string }) {
  try {
    const statusFrag = options?.status ? sql`AND status = ${options.status}` : sql``
    const rows = await sql`
      SELECT * FROM caregiver_members
      WHERE agency_id = ${agencyId}
      ${statusFrag}
      ORDER BY created_at DESC
      LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export interface GetStaffMembersPaginatedOpts {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  role?: string
}

/** Paginated, filtered staff members for an agency. */
export async function getStaffMembersByAgencyIdPaginated(agencyId: string, opts?: GetStaffMembersPaginatedOpts) {
  try {
    const page     = opts?.page     ?? 0
    const pageSize = opts?.pageSize ?? 50
    const offset   = page * pageSize

    const searchFrag = opts?.search?.trim()
      ? sql`AND (first_name ILIKE ${'%' + opts.search.trim() + '%'} OR last_name ILIKE ${'%' + opts.search.trim() + '%'} OR email ILIKE ${'%' + opts.search.trim() + '%'} OR employee_id ILIKE ${'%' + opts.search.trim() + '%'})`
      : sql``
    const statusFrag = opts?.status && opts.status !== 'all' ? sql`AND status = ${opts.status}` : sql``
    const roleFrag   = opts?.role   && opts.role   !== 'all' ? sql`AND role = ${opts.role}`     : sql``

    const [dataRows, countRows] = await Promise.all([
      sql`
        SELECT * FROM caregiver_members
        WHERE agency_id = ${agencyId}
        ${searchFrag} ${statusFrag} ${roleFrag}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS count FROM caregiver_members
        WHERE agency_id = ${agencyId}
        ${searchFrag} ${statusFrag} ${roleFrag}
      `,
    ])

    return {
      data:  dataRows as unknown as any[],
      count: countRows[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    return { data: [], count: 0, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get one staff member by id scoped to agency_id. */
export async function getStaffMemberByIdAndAgencyId(staffId: string, agencyId: string) {
  try {
    const rows = await sql`SELECT * FROM caregiver_members WHERE id = ${staffId} AND agency_id = ${agencyId} LIMIT 1`
    return { data: (rows[0] ?? null), error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get user profile role by id. */
export async function getUserProfileRoleById(userId: string) {
  try {
    const rows = await sql`SELECT role FROM user_profiles WHERE id = ${userId} LIMIT 1`
    if (!rows[0]) throw new Error('Not found')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get user profiles by ids (optional select columns, default id, full_name, role). */
export async function getUserProfilesByIds(userIds: string[], select = 'id, full_name, role') {
  if (userIds.length === 0) return { data: [], error: null }
  try {
    // select param is a trusted internal constant — not user input
    const rows = await sql`SELECT ${sql.unsafe(select)} FROM user_profiles WHERE id IN ${sql(userIds)}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get all user profiles ordered by full_name. */
export async function getUserProfilesOrdered() {
  try {
    const rows = await sql`SELECT ${sql.unsafe(USER_PROFILE_COLS)} FROM user_profiles ORDER BY full_name ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get all user profiles ordered by created_at desc. */
export async function getUserProfilesOrderedByCreatedAt() {
  try {
    const rows = await sql`SELECT ${sql.unsafe(USER_PROFILE_COLS)} FROM user_profiles ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get user profiles by role, ordered by created_at desc. */
export async function getUserProfilesByRole(role: string, select = '*') {
  try {
    const rows = await sql`SELECT ${sql.unsafe(select)} FROM user_profiles WHERE role = ${role} ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get staff members by user_ids (e.g. user_id, agency_id, company_owner_id). */
export async function getStaffMembersByUserIds(userIds: string[], select = 'user_id, agency_id, company_owner_id') {
  if (userIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT ${sql.unsafe(select)} FROM caregiver_members WHERE user_id IN ${sql(userIds)}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getCareCoordinatorsByUserIds(userIds: string[], select = 'user_id, agency_id') {
  if (userIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT ${sql.unsafe(select)} FROM care_coordinators WHERE user_id IN ${sql(userIds)}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get staff members with agency_id not null and status active. */
export async function getStaffMembersWithAgencyActive() {
  try {
    const rows = await sql`
      SELECT * FROM caregiver_members
      WHERE agency_id IS NOT NULL
        AND status = 'active'
      LIMIT 2000
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get first admin user id (for client messages adminUserId). */
export async function getFirstAdminUserId() {
  try {
    const rows = await sql`SELECT id FROM user_profiles WHERE role = 'admin' LIMIT 1`
    return { data: (rows[0] ?? null) as { id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/**
 * Update caregiver_members.documents JSONB.
 */
export async function updateStaffMemberDocuments(staffMemberId: string, documents: PatientDocument[]) {
  try {
    const rows = await sql`
      UPDATE caregiver_members
      SET documents = ${JSON.stringify(documents)}::jsonb
      WHERE id = ${staffMemberId}
      RETURNING id, documents
    `
    if (!rows[0]) throw new Error('Not found')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
