'use server'

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import type { CreateCertificationData, UpdateCertificationData } from '@/app/actions/certifications'
import { getCertification as getCredentialByIdForUser } from '@/app/actions/certifications'

export type MyStaffCertificationUi = {
  id: string
  type: string
  license_number: string
  state: string | null
  issue_date: string | null
  expiration_date: string
  issuing_authority: string
  status: string
  document_url: string | null
  created_at: string
  updated_at: string
}

type CredentialRow = {
  id: string
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
}

const READ_ONLY_MESSAGE =
  'Skills and certifications are maintained by your agency administrator or care coordinator.'

function mapCredentialRowToUi(row: CredentialRow): MyStaffCertificationUi {
  const expirationDate = row.expiration_date || ''
  const status = (row.status || '').toLowerCase()
  let displayStatus = 'Active'
  if (status === 'expired') displayStatus = 'Expired'
  else if (status === 'expiring' || status === 'expiring soon') displayStatus = 'Expiring Soon'
  else if (expirationDate) {
    const daysUntilExpiry = Math.ceil(
      (new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    if (daysUntilExpiry <= 0) displayStatus = 'Expired'
    else if (daysUntilExpiry <= 30) displayStatus = 'Expiring Soon'
  }

  return {
    id: row.id,
    type: row.source_credential_name?.trim() || 'Credential',
    license_number: row.credential_number ?? '',
    state: row.state,
    issue_date: row.issue_date,
    expiration_date: expirationDate,
    issuing_authority: row.issuing_authority?.trim() || 'N/A',
    status: displayStatus,
    document_url: row.document_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Read-only credentials for the logged-in caregiver. */
export async function getMyStaffCertifications(): Promise<{
  data: MyStaffCertificationUi[] | null
  error: string | null
  hasStaffProfile: boolean
  profile: { id: string; first_name: string; last_name: string; skills: string[] | null } | null
}> {
  const session = await getSession()
  if (!session) return { data: null, error: 'You must be logged in', hasStaffProfile: false, profile: null }

  return withUserContext(
    session.user.id,
    session.profile?.role ?? '',
    session.profile?.agency_id ?? null,
    async () => {
      const [staff] = await sql<{
        id: string
        first_name: string
        last_name: string
        skills: string[] | null
      }[]>`
        SELECT id, first_name, last_name, skills
        FROM public.caregiver_members
        WHERE user_id = ${session.user.id}::uuid AND status = 'active'
        LIMIT 1
      `

      if (!staff) return { data: [], error: null, hasStaffProfile: false, profile: null }

      try {
        const rows = await sql<CredentialRow[]>`
          SELECT * FROM public.caregiver_credentials
          WHERE caregiver_member_id = ${staff.id}::uuid
          ORDER BY expiration_date ASC
        `
        return {
          data: rows.map(mapCredentialRowToUi),
          error: null,
          hasStaffProfile: true,
          profile: {
            id: staff.id,
            first_name: staff.first_name,
            last_name: staff.last_name,
            skills: staff.skills,
          },
        }
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error.message : 'Unable to load certifications.',
          hasStaffProfile: true,
          profile: null,
        }
      }
    }
  )
}

/** Compatibility boundary: caregiver writes are intentionally denied server-side. */
export async function createMyStaffCertification(data: CreateCertificationData) {
  void data
  return {
    success: false as const,
    error: READ_ONLY_MESSAGE,
    fieldErrors: undefined as Record<string, string[]> | undefined,
    data: null,
  }
}

/** Compatibility boundary: caregiver writes are intentionally denied server-side. */
export async function updateMyStaffCertification(certificationId: string, data: UpdateCertificationData) {
  void certificationId
  void data
  return {
    success: false as const,
    error: READ_ONLY_MESSAGE,
    fieldErrors: undefined as Record<string, string[]> | undefined,
    data: null,
  }
}

export async function getMyStaffCertificationById(certificationId: string) {
  const session = await getSession()
  if (!session) return { error: 'You must be logged in', data: null }

  return withUserContext(
    session.user.id,
    session.profile?.role ?? '',
    session.profile?.agency_id ?? null,
    async () => {
      const [staff] = await sql<{ id: string }[]>`
        SELECT id FROM public.caregiver_members
        WHERE user_id = ${session.user.id}::uuid AND status = 'active'
        LIMIT 1
      `
      if (!staff) return { error: 'Staff profile not found', data: null }

      const [row] = await sql<CredentialRow[]>`
        SELECT * FROM public.caregiver_credentials
        WHERE id = ${certificationId}::uuid
          AND caregiver_member_id = ${staff.id}::uuid
        LIMIT 1
      `
      if (!row) return { error: 'Not found', data: null }
      return { error: null, data: mapCredentialRowToUi(row) }
    }
  )
}

export async function updateUnifiedCaregiverCertification(
  certificationId: string,
  data: UpdateCertificationData
) {
  return updateMyStaffCertification(certificationId, data)
}

export async function getUnifiedCaregiverCertificationDetail(certificationId: string): Promise<{
  error: string | null
  data: MyStaffCertificationUi | null
}> {
  const staffResult = await getMyStaffCertificationById(certificationId)
  if (!staffResult.error && staffResult.data) return { error: null, data: staffResult.data }

  const legacyResult = await getCredentialByIdForUser(certificationId)
  if (!legacyResult.error && legacyResult.data) {
    const credential = legacyResult.data as Record<string, unknown>
    return {
      error: null,
      data: mapCredentialRowToUi({
        id: String(credential.id),
        source_credential_name:
          (credential.source_credential_name as string) ?? (credential.type as string) ?? null,
        credential_number:
          (credential.credential_number as string) ?? (credential.license_number as string) ?? null,
        state: credential.state as string | null,
        issue_date: credential.issue_date as string | null,
        expiration_date: credential.expiration_date as string | null,
        issuing_authority: credential.issuing_authority as string | null,
        status: credential.status as string | null,
        document_url: credential.document_url as string | null,
        created_at: String(credential.created_at),
        updated_at: String(credential.updated_at),
      }),
    }
  }
  return { error: staffResult.error || legacyResult.error || 'Not found', data: null }
}
