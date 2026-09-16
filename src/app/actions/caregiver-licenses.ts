'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import sql from '@/db'
import * as q from '@/lib/supabase/query'

export type InsertCaregiverLicenseInput = {
  staffMemberId: string
  licenseType: string
  licenseNumber: string
  state: string
  expiryDate: string | null
  issueDate?: string | null
}

export async function insertCaregiverLicenseApplicationAction(
  input: InsertCaregiverLicenseInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, error: 'You must be signed in.' }

  const { data: up } = await q.getAgencyIdFromProfile(session.user.id)
  const viewerAgencyId = up?.agency_id ?? null
  if (!viewerAgencyId) return { ok: false, error: 'No organization scope found for this user.' }

  const [staff] = await sql<{ id: string; agency_id: string; user_id: string | null }[]>`
    SELECT id, agency_id, user_id FROM caregiver_members WHERE id = ${input.staffMemberId} LIMIT 1
  `
  if (!staff) return { ok: false, error: 'Caregiver not found or you do not have access.' }
  if (!staff.agency_id) return { ok: false, error: 'Caregiver has no agency; cannot attach a credential.' }
  if (staff.agency_id !== viewerAgencyId) {
    return { ok: false, error: 'You can only add licenses for caregivers in your organization.' }
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const issueDate = input.issueDate || todayStr
  const expiryDate = input.expiryDate || todayStr

  let daysUntilExpiry: number | null = null
  if (expiryDate) {
    const expiryDateObj = new Date(expiryDate)
    daysUntilExpiry = Math.ceil((expiryDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  let status: 'active' | 'expiring' | 'expired' = 'active'
  if (daysUntilExpiry !== null && daysUntilExpiry <= 0) status = 'expired'
  else if (daysUntilExpiry !== null && daysUntilExpiry <= 30) status = 'expiring'

  try {
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO caregiver_credentials (
        agency_id, caregiver_member_id, user_id,
        source_credential_name, credential_number, state, status,
        issue_date, expiration_date
      ) VALUES (
        ${staff.agency_id}, ${input.staffMemberId}, ${staff.user_id},
        ${input.licenseType.trim()}, ${input.licenseNumber.trim()},
        ${input.state.trim() || '—'}, ${status},
        ${issueDate}, ${expiryDate}
      )
      RETURNING id
    `
    if (!inserted?.id) return { ok: false, error: 'License was not saved. Please try again.' }

    const { error: auditErr } = await q.insertAuditLog({
      agency_id: staff.agency_id,
      table_name: 'caregiver_credentials',
      record_id: inserted.id,
      action: 'INSERT',
      performed_by_user_id: session.user.id,
      details: {
        caregiver_member_id: input.staffMemberId,
        license_type:        input.licenseType.trim(),
        state:               input.state.trim() || '—',
        status,
        issue_date:          issueDate,
        expiry_date:         expiryDate,
      },
    })
    if (auditErr) console.error('[caregiver-licenses/insert] Audit log failed. credentialId=%s err=%s', inserted.id, auditErr.message)

    revalidatePath(`/pages/agency/caregiver/${input.staffMemberId}`)
    revalidatePath('/pages/agency/caregiver')
    return { ok: true, id: inserted.id }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed to save license.' }
  }
}
