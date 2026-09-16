'use server'

import sql from '@/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { getConfigurationValues } from '@/app/actions/configuration-values'

export interface CreateCertificationData {
  type: string
  license_number: string
  state?: string | null
  issue_date?: string | null
  expiration_date: string
  issuing_authority: string
  status: string
  document_url?: string | null
}

type CredentialRow = Record<string, unknown>

function mapCredentialToLegacyCert(row: CredentialRow) {
  return {
    ...row,
    type: row.source_credential_name,
    license_number: row.credential_number,
  }
}

export async function createCertification(data: CreateCertificationData) {
  try {
    const session = await getSession()
    if (!session) return { error: 'You must be logged in to create a certification', data: null }

    const [staff] = await sql<{ id: string; agency_id: string }[]>`
      SELECT id, agency_id FROM caregiver_members WHERE user_id = ${session.user.id} LIMIT 1
    `
    if (!staff?.agency_id) {
      return {
        error: 'Your account must be linked to an agency staff profile to save certifications. Ask your agency to connect your login.',
        data: null,
      }
    }

    const [certification] = await sql<CredentialRow[]>`
      INSERT INTO caregiver_credentials (
        agency_id, caregiver_member_id, user_id,
        source_credential_name, credential_number, state, issue_date,
        expiration_date, issuing_authority, status, document_url
      ) VALUES (
        ${staff.agency_id}, ${staff.id}, ${session.user.id},
        ${data.type}, ${data.license_number}, ${data.state || null}, ${data.issue_date || null},
        ${data.expiration_date}, ${data.issuing_authority}, ${data.status}, ${data.document_url || null}
      )
      RETURNING *
    `
    revalidatePath('/pages/caregiver/my-certifications')
    return { error: null, data: certification ? mapCredentialToLegacyCert(certification) : null }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create certification', data: null }
  }
}

export async function getCertifications() {
  try {
    const session = await getSession()
    if (!session) return { error: 'You must be logged in', data: null }

    const rows = await sql<CredentialRow[]>`
      SELECT * FROM caregiver_credentials WHERE user_id = ${session.user.id} ORDER BY expiration_date ASC
    `
    return { error: null, data: rows.map(mapCredentialToLegacyCert) }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch certifications', data: null }
  }
}

export async function getCertificationTypes() {
  try {
    const result = await getConfigurationValues('CERTIFICATION_TYPE')
    if (result.error) return { error: String(result.error), data: null }
    return { error: null, data: (result.data ?? []).map(v => ({ id: v.id, name: v.name })) }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch certification types', data: null }
  }
}

export interface UpdateCertificationData {
  type: string
  license_number: string
  state?: string | null
  issue_date?: string | null
  expiration_date: string
  issuing_authority: string
  status: string
  document_url?: string | null
}

export async function updateCertification(certificationId: string, data: UpdateCertificationData) {
  try {
    const session = await getSession()
    if (!session) return { error: 'You must be logged in to update a certification', data: null }

    const [certification] = await sql<CredentialRow[]>`
      UPDATE caregiver_credentials SET
        source_credential_name = ${data.type},
        credential_number      = ${data.license_number},
        state                  = ${data.state || null},
        issue_date             = ${data.issue_date || null},
        expiration_date        = ${data.expiration_date},
        issuing_authority      = ${data.issuing_authority},
        status                 = ${data.status},
        document_url           = ${data.document_url || null},
        updated_at             = ${new Date().toISOString()}
      WHERE id = ${certificationId} AND user_id = ${session.user.id}
      RETURNING *
    `
    revalidatePath('/pages/caregiver/my-certifications')
    revalidatePath(`/pages/caregiver/my-certifications/${certificationId}`)
    return { error: null, data: certification ? mapCredentialToLegacyCert(certification) : null }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update certification', data: null }
  }
}

export async function getCertification(certificationId: string) {
  try {
    const session = await getSession()
    if (!session) return { error: 'You must be logged in', data: null }

    const [certification] = await sql<CredentialRow[]>`
      SELECT * FROM caregiver_credentials WHERE id = ${certificationId} AND user_id = ${session.user.id} LIMIT 1
    `
    if (!certification) return { error: 'Certification not found', data: null }
    return { error: null, data: mapCredentialToLegacyCert(certification) }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch certification', data: null }
  }
}
