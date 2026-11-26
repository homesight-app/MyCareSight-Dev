import { agencyBranchesEnabled } from '@/lib/agency-branches'
import type { ClientListSortKey } from '@/lib/client-list'
import sql from '@/db'
import { normalizeDatabaseRow, normalizeDatabaseRows } from '@/lib/database-date-contract'
import { readPatientDocuments } from '@/lib/patient-document-metadata'

const PATIENT_TEMPORAL_CONTRACT = {
  dates: ['date_of_birth', 'start_date'] as const,
  timestamps: ['created_at', 'updated_at'] as const,
}

function normalizePatientRow<T extends Record<string, unknown>>(row: T): T {
  return normalizeDatabaseRow(row, PATIENT_TEMPORAL_CONTRACT)
}

const pgError = (err: unknown) => ({
  message: err instanceof Error ? err.message : String(err),
  code: '',
  details: '',
  hint: '',
  name: 'Error',
})

/** Insert a patient and return the new row shaped like agency client list reads (with representatives). */
export async function insertPatient(data: Record<string, unknown>) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    const rows = await sql`
      INSERT INTO patients ${sql(data as Record<string, unknown>, ...keys)}
      RETURNING *,
        (
          SELECT json_agg(r ORDER BY r.display_order)
          FROM patients_representatives r
          WHERE r.patient_id = patients.id
        ) AS patients_representatives
    `
    if (!rows[0]) throw new Error('Insert did not return a row')
    const row = normalizePatientRow(rows[0]) as any
    if (!row.patients_representatives) row.patients_representatives = []
    return { data: row, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patients by owner_id. */
export async function getPatientsByOwnerId(ownerId: string) {
  try {
    const rows = await sql`
      SELECT p.*,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', r.id,
              'name', r.name,
              'relationship', r.relationship,
              'phone_number', r.phone_number,
              'email_address', r.email_address
            ) ORDER BY r.display_order)
            FROM patients_representatives r
            WHERE r.patient_id = p.id
          ),
          '[]'
        ) AS patients_representatives
      FROM patients p
      WHERE p.owner_id = ${ownerId}
      ORDER BY p.created_at DESC
      LIMIT 1000
    `
    return { data: normalizeDatabaseRows(rows, PATIENT_TEMPORAL_CONTRACT) as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patients by owner_id list (agency-wide), ordered by created_at desc. */
export async function getPatientsByOwnerIds(ownerIds: string[]) {
  if (ownerIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT p.*,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', r.id,
              'name', r.name,
              'relationship', r.relationship,
              'phone_number', r.phone_number,
              'email_address', r.email_address
            ) ORDER BY r.display_order)
            FROM patients_representatives r
            WHERE r.patient_id = p.id
          ),
          '[]'
        ) AS patients_representatives
      FROM patients p
      WHERE p.owner_id IN ${sql(ownerIds)}
      ORDER BY p.created_at DESC
      LIMIT 1000
    `
    return { data: normalizeDatabaseRows(rows, PATIENT_TEMPORAL_CONTRACT) as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export type GetPatientsByAgencyIdOpts = {
  sortKey?: ClientListSortKey
  sortDir?: 'asc' | 'desc'
  branchId?: string
  page?: number
  pageSize?: number
  search?: string
  status?: string
}

/** Current authorized agency page; sorting/filtering precede LIMIT, with a stable ID tie-break.
 * The separate count query does not load representative or branch metadata. */
export async function getPatientsByAgencyId(
  agencyId: string,
  opts?: GetPatientsByAgencyIdOpts
) {
  const page     = opts?.page     ?? 0
  const pageSize = opts?.pageSize ?? 50
  const from = page * pageSize
  const searchTerm = opts?.search?.trim() ?? ''
  const statusFilter = opts?.status && opts.status !== 'all' ? opts.status : null
  const showBranch = agencyBranchesEnabled()
  const direction = opts?.sortDir === 'asc' ? sql`ASC` : sql`DESC`
  const sort = opts?.sortKey
  const column = sort === 'name' ? sql`p.last_name`
    : sort === 'gender' ? sql`p.gender` : sort === 'class' ? sql`p.class`
    : sort === 'phone' ? sql`p.phone_number` : sort === 'emergency_contact' ? sql`p.emergency_contact_name`
    : sort === 'status' ? sql`p.status`
    : sort === 'branch_name' && showBranch ? sql`branch.name`
    : sort === 'representative_1' || sort === 'representative_2'
      ? sql`(SELECT representative.name FROM patients_representatives representative WHERE representative.patient_id = p.id
          ORDER BY representative.display_order, representative.id LIMIT 1 OFFSET ${sort === 'representative_2' ? 1 : 0})`
      : null
  const ordering = column ? sql`${column} ${direction} NULLS LAST, ${sort === 'name' ? sql`p.first_name ${direction},` : sql``} p.id`
    : sql`p.status DESC, p.created_at ${direction}, p.id`

  try {
    const searchFragment = searchTerm
      ? sql`AND (
          p.first_name ILIKE ${'%' + searchTerm + '%'}
          OR p.last_name ILIKE ${'%' + searchTerm + '%'}
          OR p.email_address ILIKE ${'%' + searchTerm + '%'}
          OR p.phone_number ILIKE ${'%' + searchTerm + '%'}
        )`
      : sql``

    const branchFragment = opts?.branchId ? sql`AND p.branch_id = ${opts.branchId}::uuid` : sql``
    const statusFragment = statusFilter
      ? sql`AND p.status = ${statusFilter}`
      : sql``

    const [dataRows, countRows] = await Promise.all([
      sql`
        SELECT p.*,
          ${showBranch ? sql`branch.name AS branch_name,` : sql``}
          COALESCE(
            (
              SELECT json_agg(json_build_object(
                'id', r.id,
                'name', r.name,
                'relationship', r.relationship,
                'phone_number', r.phone_number,
                'email_address', r.email_address
              ) ORDER BY r.display_order, r.id)
              FROM patients_representatives r
              WHERE r.patient_id = p.id
            ),
            '[]'
          ) AS patients_representatives
        FROM patients p
        ${showBranch ? sql`LEFT JOIN public.agency_branches branch ON branch.id = p.branch_id AND branch.agency_id = p.agency_id` : sql``}
        WHERE p.agency_id = ${agencyId}
        ${searchFragment}
        ${statusFragment} ${branchFragment}
        ORDER BY ${ordering}
        LIMIT ${pageSize} OFFSET ${from}
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM patients p
        WHERE p.agency_id = ${agencyId}
        ${searchFragment}
        ${statusFragment} ${branchFragment}
      `,
    ])

    return {
      data: normalizeDatabaseRows(dataRows, PATIENT_TEMPORAL_CONTRACT) as unknown as any[],
      count: countRows[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    return { data: null, count: null, error: pgError(err) }
  }
}

/** Get total + active patient counts for an agency (no rows fetched). */
export async function getPatientCountsByAgencyId(agencyId: string, branchId?: string) {
  try {
    const branchFragment = branchId ? sql`AND branch_id = ${branchId}::uuid` : sql``
    const [totalRows, activeRows] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM patients WHERE agency_id = ${agencyId} ${branchFragment}`,
      sql`SELECT COUNT(*)::int AS count FROM patients WHERE agency_id = ${agencyId} AND status = 'active' ${branchFragment}`,
    ])
    return { total: totalRows[0]?.count ?? 0, active: activeRows[0]?.count ?? 0 }
  } catch {
    return { total: 0, active: 0 }
  }
}

/** Update patient status by id. */
export async function updatePatientStatus(patientId: string, status: string) {
  try {
    await sql`UPDATE patients SET status = ${status} WHERE id = ${patientId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Update patient login_access by id. */
export async function updatePatientLoginAccess(patientId: string, loginAccess: boolean) {
  try {
    await sql`UPDATE patients SET login_access = ${loginAccess} WHERE id = ${patientId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Update patient fields (e.g. personal info) by id. */
export async function updatePatient(
  patientId: string,
  data: { first_name?: string; last_name?: string; gender?: string | null; date_of_birth?: string }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    await sql`UPDATE patients SET ${sql(data as Record<string, unknown>, ...keys)} WHERE id = ${patientId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Update patient medical fields by id. */
export async function updatePatientMedical(
  patientId: string,
  data: { primary_diagnosis?: string | null; current_medications?: string | null; allergies?: string | null }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    await sql`UPDATE patients SET ${sql(data as Record<string, unknown>, ...keys)} WHERE id = ${patientId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Document item stored in patients.documents JSONB. */
export type PatientDocument = {
  id: string
  name: string
  path: string
  url?: string
  uploaded_at: string
  size?: number
}

/** Update patient documents (JSONB array). Returns updated row or error. */
export async function updatePatientDocuments(patientId: string, documents: PatientDocument[]) {
  try {
    const rows = await sql`
      UPDATE patients
      SET documents = ${JSON.stringify(documents)}::jsonb
      WHERE id = ${patientId}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Update did not return a row')
    return { data: normalizePatientRow(rows[0]) as any, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patient by id and owner_id (for detail page). */
export async function getPatientByIdAndOwnerId(patientId: string, ownerId: string) {
  try {
    const rows = await sql`
      SELECT p.*,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', r.id,
              'name', r.name,
              'relationship', r.relationship,
              'phone_number', r.phone_number,
              'email_address', r.email_address
            ) ORDER BY r.display_order)
            FROM patients_representatives r
            WHERE r.patient_id = p.id
          ),
          '[]'
        ) AS patients_representatives
      FROM patients p
      WHERE p.id = ${patientId}
        AND p.owner_id = ${ownerId}
      LIMIT 1
    `
    if (!rows[0]) throw new Error('Patient not found')
    return { data: normalizePatientRow(rows[0]) as any, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patient by id and owner_id list (agency-wide detail page access). */
export async function getPatientByIdAndOwnerIds(patientId: string, ownerIds: string[]) {
  if (ownerIds.length === 0) return { data: null, error: null }
  try {
    const rows = await sql`
      SELECT p.*,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', r.id,
              'name', r.name,
              'relationship', r.relationship,
              'phone_number', r.phone_number,
              'email_address', r.email_address
            ) ORDER BY r.display_order)
            FROM patients_representatives r
            WHERE r.patient_id = p.id
          ),
          '[]'
        ) AS patients_representatives
      FROM patients p
      WHERE p.id = ${patientId}
        AND p.owner_id IN ${sql(ownerIds)}
      LIMIT 1
    `
    return { data: rows[0] ? normalizePatientRow(rows[0]) as any : null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patient by id and agency_id (agency-wide detail page access). */
export async function getPatientByIdAndAgencyId(patientId: string, agencyId: string) {
  try {
    const rows = await sql`
      SELECT p.*,
        ${agencyBranchesEnabled() ? sql`branch.name AS branch_name,` : sql``}
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', r.id,
              'name', r.name,
              'relationship', r.relationship,
              'phone_number', r.phone_number,
              'email_address', r.email_address
            ) ORDER BY r.display_order)
            FROM patients_representatives r
            WHERE r.patient_id = p.id
          ),
          '[]'
        ) AS patients_representatives
      FROM patients p
      ${agencyBranchesEnabled() ? sql`LEFT JOIN public.agency_branches branch ON branch.id = p.branch_id AND branch.agency_id = p.agency_id` : sql``}
      WHERE p.id = ${patientId}
        AND p.agency_id = ${agencyId}
      LIMIT 1
    `
    if (!rows[0]) return { data: null, error: null }
    const row = normalizePatientRow(rows[0])
    return { data: { ...row, documents: readPatientDocuments(row.documents) } as any, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patients by owner_id (id, first_name, last_name) for lists/navigation, ordered by last_name. */
export async function getPatientsByOwnerIdMinimal(ownerId: string) {
  try {
    const rows = await sql`
      SELECT id, first_name, last_name
      FROM patients
      WHERE owner_id = ${ownerId}
      ORDER BY last_name ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patients by owner_id list (id, first_name, last_name), ordered by last_name. */
export async function getPatientsByOwnerIdsMinimal(ownerIds: string[]) {
  if (ownerIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT id, first_name, last_name
      FROM patients
      WHERE owner_id IN ${sql(ownerIds)}
      ORDER BY last_name ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Get patients by agency_id (id, first_name, last_name), ordered by last_name. */
export async function getPatientsByAgencyIdMinimal(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, first_name, last_name
      FROM patients
      WHERE agency_id = ${agencyId}
      ORDER BY last_name ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}
