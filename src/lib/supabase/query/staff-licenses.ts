import sql from '@/db'

export type StaffLicenseListRow = {
  id: string
  caregiver_member_id: string
  license_type: string
  license_number: string
  state: string | null
  issue_date: string | null
  expiry_date: string | null
  issuing_authority: string | null
  status: string
  document_url: string | null
  days_until_expiry: number | null
  created_at: string
  updated_at: string
}

function mapCredentialToLicenseListRow(row: {
  id: string
  caregiver_member_id: string | null
  source_credential_name: string | null
  credential_number: string | null
  state: string | null
  issue_date: string | null
  expiration_date: string | null
  issuing_authority: string | null
  status: string | null
  document_url: string | null
  created_at: string
  updated_at: string
}): StaffLicenseListRow | null {
  if (!row.caregiver_member_id) return null
  const expiryStr = row.expiration_date
  let days_until_expiry: number | null = null
  if (expiryStr) {
    const expiry = new Date(expiryStr)
    days_until_expiry = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }
  const statusRaw = (row.status || '').toLowerCase()
  let status = row.status || 'active'
  if (statusRaw === 'active' || statusRaw === 'expiring' || statusRaw === 'expired') {
    status = statusRaw
  } else if (days_until_expiry !== null) {
    if (days_until_expiry <= 0) status = 'expired'
    else if (days_until_expiry <= 30) status = 'expiring'
    else status = 'active'
  }
  return {
    id: row.id,
    caregiver_member_id: row.caregiver_member_id as string,
    license_type: row.source_credential_name?.trim() || 'Credential',
    license_number: row.credential_number ?? '',
    state: row.state,
    issue_date: row.issue_date,
    expiry_date: row.expiration_date,
    issuing_authority: row.issuing_authority,
    status,
    document_url: row.document_url,
    days_until_expiry,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function getStaffLicensesByStaffMemberIds(
  staffMemberIds: string[]
): Promise<{ data: StaffLicenseListRow[] | null; error: Error | null }> {
  if (staffMemberIds.length === 0) return { data: [] as unknown as StaffLicenseListRow[], error: null }
  try {
    const rows = await sql`
      SELECT id, caregiver_member_id, source_credential_name, credential_number,
             state, issue_date, expiration_date, issuing_authority, status,
             document_url, created_at, updated_at
      FROM caregiver_credentials
      WHERE caregiver_member_id = ANY(${staffMemberIds as any})
    `
    const mapped = (rows as unknown as Parameters<typeof mapCredentialToLicenseListRow>[0][])
      .map((r) => mapCredentialToLicenseListRow(r))
      .filter((r): r is StaffLicenseListRow => r !== null)
    return { data: mapped, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertStaffLicenseRow(
  data: Record<string, unknown>
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const agencyId = data.agency_id as string | undefined
  if (!agencyId) {
    return { data: null, error: new Error('agency_id is required for caregiver_credentials') }
  }
  try {
    const payload = {
      agency_id: agencyId,
      caregiver_member_id: data.caregiver_member_id as string,
      user_id: (data.user_id as string | null) ?? null,
      source_credential_name: (data.license_type as string) || 'Credential',
      credential_number: (data.license_number as string) || '',
      state: (data.state as string) || null,
      issue_date: (data.issue_date as string) || null,
      expiration_date: (data.expiry_date as string) || (data.expiration_date as string) || null,
      issuing_authority: (data.issuing_authority as string) || null,
      status: String(data.status ?? 'active'),
      document_url: (data.document_url as string) || null,
    }
    const rows = await sql`
      INSERT INTO caregiver_credentials ${sql(payload, ...Object.keys(payload) as any)}
      RETURNING id
    `
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateStaffLicenseRow(
  id: string,
  data: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
  const payload: Record<string, unknown> = {}
  if (data.license_type !== undefined) payload.source_credential_name = data.license_type
  if (data.license_number !== undefined) payload.credential_number = data.license_number
  if (data.state !== undefined) payload.state = data.state
  if (data.issue_date !== undefined) payload.issue_date = data.issue_date
  if (data.expiry_date !== undefined) payload.expiration_date = data.expiry_date
  if (data.expiration_date !== undefined) payload.expiration_date = data.expiration_date
  if (data.issuing_authority !== undefined) payload.issuing_authority = data.issuing_authority
  if (data.status !== undefined) payload.status = data.status
  if (data.document_url !== undefined) payload.document_url = data.document_url
  try {
    const rows = await sql`
      UPDATE caregiver_credentials
      SET ${sql(payload, ...Object.keys(payload) as any)}
      WHERE id = ${id}
      RETURNING *
    `
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
