'use server'

import sql from '@/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'
import type { CreateCertificationData, UpdateCertificationData } from '@/app/actions/certifications'
import { getCertification as getCredentialByIdForUser } from '@/app/actions/certifications'
import { certificationSchema } from '@/lib/schemas/certification'
import { zodErrorToFieldErrors } from '@/lib/validation'

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

function computeExpiryFields(expiryDateStr: string) {
  const today = new Date()
  const expiryDateObj = new Date(expiryDateStr)
  const diffTime = expiryDateObj.getTime() - today.getTime()
  const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  let status: 'active' | 'expiring' | 'expired' = 'active'
  if (daysUntilExpiry <= 0) status = 'expired'
  else if (daysUntilExpiry <= 30) status = 'expiring'
  return { days_until_expiry: daysUntilExpiry, status }
}

function mapCredentialRowToUi(row: CredentialRow): MyStaffCertificationUi {
  const expStr = row.expiration_date || ''
  const statusRaw = (row.status || '').toLowerCase()
  let displayStatus = 'Active'
  if (statusRaw === 'expired') displayStatus = 'Expired'
  else if (statusRaw === 'expiring' || statusRaw === 'expiring soon') displayStatus = 'Expiring Soon'
  else if (expStr) {
    const today = new Date()
    const expiryDateObj = new Date(expStr)
    const daysUntilExpiry = Math.ceil((expiryDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilExpiry <= 0) displayStatus = 'Expired'
    else if (daysUntilExpiry <= 30) displayStatus = 'Expiring Soon'
  }

  return {
    id: row.id,
    type: row.source_credential_name?.trim() || 'Credential',
    license_number: row.credential_number ?? '',
    state: row.state,
    issue_date: row.issue_date,
    expiration_date: expStr,
    issuing_authority: row.issuing_authority?.trim() || 'N/A',
    status: displayStatus,
    document_url: row.document_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Certifications for the logged-in caregiver (caregiver_credentials). */
export async function getMyStaffCertifications(): Promise<{
  data: MyStaffCertificationUi[] | null
  error: string | null
  hasStaffProfile: boolean
  profile: { id: string; first_name: string; last_name: string; skills: string[] | null } | null
}> {
  const session = await getSession()
  if (!session) return { data: null, error: 'You must be logged in', hasStaffProfile: false, profile: null }

  const [staff] = await sql<{ id: string; agency_id: string; first_name: string; last_name: string; skills: string[] | null }[]>`
    SELECT id, agency_id, first_name, last_name, skills
    FROM public.caregiver_members
    WHERE user_id = ${session.user.id}::uuid AND status = 'active'
    LIMIT 1
  `

  try {
    const rows = staff?.id
      ? await sql<CredentialRow[]>`
          SELECT * FROM caregiver_credentials
          WHERE caregiver_member_id = ${staff.id}
          ORDER BY expiration_date ASC
        `
      : await sql<CredentialRow[]>`
          SELECT * FROM caregiver_credentials
          WHERE user_id = ${session.user.id}
          ORDER BY expiration_date ASC
        `

    return {
      data: rows.map(mapCredentialRowToUi),
      error: null,
      hasStaffProfile: Boolean(staff?.id),
      profile: staff ? {
        id: staff.id,
        first_name: staff.first_name,
        last_name: staff.last_name,
        skills: staff.skills,
      } : null,
    }
  } catch (err: any) {
    return { data: null, error: err.message, hasStaffProfile: Boolean(staff?.id), profile: null }
  }
}

export async function createMyStaffCertification(data: CreateCertificationData) {
  const parsed = certificationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false as const, error: 'Please complete required fields', fieldErrors: zodErrorToFieldErrors(parsed.error), data: null }
  }

  const session = await getSession()
  if (!session) return { success: false as const, error: 'You must be logged in to create a certification', data: null }

  const { data: staff, error: staffError } = await q.getStaffMemberByUserId(session.user.id)
  if (staffError || !staff?.id || !staff.agency_id) {
    return {
      success: false as const,
      error: 'Your login is not linked to an agency staff profile. Ask your agency to connect your account so certifications stay in sync with the agency dashboard.',
      data: null,
    }
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const issueDate = data.issue_date?.trim() || todayStr
  const expiryDate = data.expiration_date.trim()
  const { status } = computeExpiryFields(expiryDate)

  try {
    const [inserted] = await sql<CredentialRow[]>`
      INSERT INTO caregiver_credentials (
        agency_id, caregiver_member_id, user_id,
        source_credential_name, credential_number, state, status,
        issue_date, expiration_date, issuing_authority, document_url
      ) VALUES (
        ${staff.agency_id}, ${staff.id}, ${session.user.id},
        ${data.type.trim()}, ${data.license_number.trim()},
        ${(data.state?.trim() || '—') || '—'}, ${status},
        ${issueDate}, ${expiryDate},
        ${data.issuing_authority.trim()}, ${data.document_url ?? null}
      )
      RETURNING *
    `
    if (!inserted) return { success: false as const, error: 'Insert failed', data: null }

    revalidatePath('/pages/caregiver/my-certifications')
    revalidatePath('/pages/caregiver')
    return { success: true as const, error: null, data: mapCredentialRowToUi(inserted) }
  } catch (err: any) {
    return { success: false as const, error: err.message, data: null }
  }
}

export async function updateMyStaffCertification(certificationId: string, data: UpdateCertificationData) {
  const parsed = certificationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false as const, error: 'Please complete required fields', fieldErrors: zodErrorToFieldErrors(parsed.error), data: null }
  }

  const session = await getSession()
  if (!session) return { success: false as const, error: 'You must be logged in to update a certification', data: null }

  const { data: staff, error: staffError } = await q.getStaffMemberByUserId(session.user.id)
  if (staffError || !staff?.id) {
    return {
      success: false as const,
      error: 'Your login is not linked to an agency staff profile. Ask your agency to connect your account.',
      data: null,
    }
  }

  // Verify ownership
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM caregiver_credentials
    WHERE id = ${certificationId} AND caregiver_member_id = ${staff.id}
    LIMIT 1
  `
  if (!existing) return { success: false as const, error: 'Certification not found or you do not have access.', data: null }

  const expiryDate = data.expiration_date.trim()
  const { status } = computeExpiryFields(expiryDate)

  try {
    const [updated] = await sql<CredentialRow[]>`
      UPDATE caregiver_credentials SET
        source_credential_name = ${data.type.trim()},
        credential_number      = ${data.license_number.trim()},
        state                  = ${(data.state?.trim() || '—') || '—'},
        issue_date             = ${data.issue_date?.trim() || null},
        expiration_date        = ${expiryDate},
        status                 = ${status},
        issuing_authority      = ${data.issuing_authority.trim()},
        document_url           = ${data.document_url ?? null},
        updated_at             = ${new Date().toISOString()}
      WHERE id = ${certificationId} AND caregiver_member_id = ${staff.id}
      RETURNING *
    `
    if (!updated) return { success: false as const, error: 'Update failed', data: null }

    revalidatePath('/pages/caregiver/my-certifications')
    revalidatePath(`/pages/caregiver/my-certifications/${certificationId}`)
    revalidatePath('/pages/caregiver')
    return { success: true as const, error: null, data: mapCredentialRowToUi(updated) }
  } catch (err: any) {
    return { success: false as const, error: err.message, data: null }
  }
}

export async function getMyStaffCertificationById(certificationId: string) {
  const session = await getSession()
  if (!session) return { error: 'You must be logged in', data: null }

  const { data: staff, error: staffError } = await q.getStaffMemberByUserId(session.user.id)
  if (staffError || !staff?.id) return { error: 'Staff profile not found', data: null }

  const [row] = await sql<CredentialRow[]>`
    SELECT * FROM caregiver_credentials
    WHERE id = ${certificationId} AND caregiver_member_id = ${staff.id}
    LIMIT 1
  `
  if (!row) return { error: 'Not found', data: null }
  return { error: null, data: mapCredentialRowToUi(row) }
}

export async function updateUnifiedCaregiverCertification(
  certificationId: string,
  data: UpdateCertificationData
) {
  const staffTry = await updateMyStaffCertification(certificationId, data)
  if (!staffTry.error) return staffTry
  const err = (staffTry.error || '').toLowerCase()
  if (err.includes('not found') || err.includes('access')) {
    const { updateCertification } = await import('@/app/actions/certifications')
    const legacyResult = await updateCertification(certificationId, data)
    if (legacyResult.error) return { success: false as const, error: legacyResult.error, data: null }
    return { success: true as const, error: null, data: legacyResult.data }
  }
  return staffTry
}

export async function getUnifiedCaregiverCertificationDetail(certificationId: string): Promise<{
  error: string | null
  data: MyStaffCertificationUi | null
}> {
  const staffResult = await getMyStaffCertificationById(certificationId)
  if (!staffResult.error && staffResult.data) return { error: null, data: staffResult.data }

  const legacyResult = await getCredentialByIdForUser(certificationId)
  if (!legacyResult.error && legacyResult.data) {
    const d = legacyResult.data as Record<string, unknown>
    return {
      error: null,
      data: mapCredentialRowToUi({
        id: String(d.id),
        source_credential_name: (d.source_credential_name as string) ?? (d.type as string) ?? null,
        credential_number: (d.credential_number as string) ?? (d.license_number as string) ?? null,
        state: d.state as string | null,
        issue_date: d.issue_date as string | null,
        expiration_date: d.expiration_date as string | null,
        issuing_authority: d.issuing_authority as string | null,
        status: d.status as string | null,
        document_url: d.document_url as string | null,
        created_at: String(d.created_at),
        updated_at: String(d.updated_at),
      }),
    }
  }
  return { error: staffResult.error || legacyResult.error || 'Not found', data: null }
}
