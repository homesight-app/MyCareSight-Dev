'use server'

import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { createAdminClient } from '@/lib/supabase/admin'

export type InsertCaregiverLicenseInput = {
  staffMemberId: string
  licenseType: string
  licenseNumber: string
  state: string
  expiryDate: string | null
  issueDate?: string | null
}

/**
 * Inserts a caregiver_credentials row for caregiver licenses/certifications.
 * Uses the service role after verifying the signed-in user may manage this caregiver,
 * so inserts work even when RLS has not been extended yet in the target environment.
 */
export async function insertCaregiverLicenseApplicationAction(
  input: InsertCaregiverLicenseInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session?.user?.id) {
    return { ok: false, error: 'You must be signed in.' }
  }

  const userId = session.user.id
  const supabase = await createClient()

  const { data: up } = await q.getAgencyIdFromProfile(supabase, userId)
  const viewerAgencyId = up?.agency_id ?? null
  if (!viewerAgencyId) {
    return { ok: false, error: 'No organization scope found for this user.' }
  }

  const { data: staff, error: staffErr } = await supabase
    .from('caregiver_members')
    .select('id, agency_id, user_id')
    .eq('id', input.staffMemberId)
    .maybeSingle()

  if (staffErr || !staff) {
    return { ok: false, error: 'Caregiver not found or you do not have access.' }
  }

  if (!staff.agency_id) {
    return { ok: false, error: 'Caregiver has no agency; cannot attach a credential.' }
  }

  if (staff.agency_id !== viewerAgencyId) {
    return {
      ok: false,
      error: 'You can only add licenses for caregivers in your organization.',
    }
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const issueDate = input.issueDate || todayStr
  const expiryDate = input.expiryDate || todayStr

  let daysUntilExpiry: number | null = null
  if (expiryDate) {
    const expiryDateObj = new Date(expiryDate)
    const diffTime = expiryDateObj.getTime() - today.getTime()
    daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  let status: 'active' | 'expiring' | 'expired' = 'active'
  if (daysUntilExpiry !== null && daysUntilExpiry <= 0) {
    status = 'expired'
  } else if (daysUntilExpiry !== null && daysUntilExpiry <= 30) {
    status = 'expiring'
  }

  const row = {
    agency_id: staff.agency_id,
    caregiver_member_id: input.staffMemberId,
    user_id: staff.user_id,
    license_type: input.licenseType.trim(),
    license_number: input.licenseNumber.trim(),
    state: input.state.trim() || '—',
    status,
    issue_date: issueDate,
    expiry_date: expiryDate,
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('caregiver_credentials').insert({
      agency_id: row.agency_id,
      caregiver_member_id: row.caregiver_member_id,
      user_id: row.user_id,
      source_credential_name: row.license_type,
      credential_number: row.license_number,
      state: row.state,
      status: row.status,
      issue_date: row.issue_date,
      expiration_date: row.expiry_date,
    }).select('id').single()

    if (error) {
      return { ok: false, error: error.message || 'Failed to save license.' }
    }
    if (!data?.id) {
      return { ok: false, error: 'License was not saved. Please try again.' }
    }
    return { ok: true, id: data.id }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const missingServiceRole =
      msg.includes('SUPABASE_SERVICE_ROLE_KEY') || msg.includes('Missing SUPABASE_SERVICE_ROLE_KEY')

    if (missingServiceRole) {
      const { data, error } = await q.insertStaffLicenseRow(supabase, row)
      if (error) {
        return {
          ok: false,
          error:
            `${error.message} If this is an RLS error, apply caregiver_credentials policies in Supabase, or set SUPABASE_SERVICE_ROLE_KEY on the server.`,
        }
      }
      if (!data?.id) {
        return {
          ok: false,
          error:
            'License was not saved. Set SUPABASE_SERVICE_ROLE_KEY on the server or apply caregiver_credentials RLS migration.',
        }
      }
      return { ok: true, id: data.id }
    }
    return { ok: false, error: msg || 'Failed to save license.' }
  }
}
