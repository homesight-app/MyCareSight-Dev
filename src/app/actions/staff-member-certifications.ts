'use server'

import { createClient } from '@/lib/supabase/server'
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

function mapCredentialRowToUi(row: {
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
}): MyStaffCertificationUi {
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
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { data: null, error: 'You must be logged in', hasStaffProfile: false }
  }

  const { data: staff, error: staffError } = await q.getStaffMemberByUserId(supabase, user.id)
  if (staffError) {
    return { data: null, error: staffError.message, hasStaffProfile: false }
  }

  let query = supabase.from('caregiver_credentials').select('*').order('expiration_date', { ascending: true })
  if (staff?.id) {
    query = query.eq('caregiver_member_id', staff.id)
  } else {
    query = query.eq('user_id', user.id)
  }

  const { data: rows, error: credError } = await query
  if (credError) {
    return { data: null, error: credError.message, hasStaffProfile: Boolean(staff?.id) }
  }

  const list = (rows || []).map((r) =>
    mapCredentialRowToUi(r as Parameters<typeof mapCredentialRowToUi>[0])
  )
  return { data: list, error: null, hasStaffProfile: Boolean(staff?.id) }
}

export async function createMyStaffCertification(data: CreateCertificationData) {
  const parsed = certificationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false as const, error: 'Please complete required fields', fieldErrors: zodErrorToFieldErrors(parsed.error), data: null }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false as const, error: 'You must be logged in to create a certification', data: null }
  }

  const { data: staff, error: staffError } = await q.getStaffMemberByUserId(supabase, user.id)
  if (staffError || !staff?.id || !staff.agency_id) {
    return {
      success: false as const,
      error:
        'Your login is not linked to an agency staff profile. Ask your agency to connect your account so certifications stay in sync with the agency dashboard.',
      data: null,
    }
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const issueDate = data.issue_date?.trim() || todayStr
  const expiryDate = data.expiration_date.trim()
  const { status } = computeExpiryFields(expiryDate)

  const { data: inserted, error: insertError } = await supabase
    .from('caregiver_credentials')
    .insert({
      agency_id: staff.agency_id,
      caregiver_member_id: staff.id,
      user_id: user.id,
      source_credential_name: data.type.trim(),
      credential_number: data.license_number.trim(),
      state: (data.state?.trim() || '—') || '—',
      status,
      issue_date: issueDate,
      expiration_date: expiryDate,
      issuing_authority: data.issuing_authority.trim(),
      document_url: data.document_url ?? null,
    })
    .select()
    .single()

  if (insertError) {
    return { success: false as const, error: insertError.message, data: null }
  }

  revalidatePath('/pages/caregiver/my-certifications')
  revalidatePath('/pages/caregiver')
  return {
    success: true as const,
    error: null,
    data: inserted ? mapCredentialRowToUi(inserted as Parameters<typeof mapCredentialRowToUi>[0]) : null,
  }
}

export async function updateMyStaffCertification(certificationId: string, data: UpdateCertificationData) {
  const parsed = certificationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false as const, error: 'Please complete required fields', fieldErrors: zodErrorToFieldErrors(parsed.error), data: null }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false as const, error: 'You must be logged in to update a certification', data: null }
  }

  const { data: staff, error: staffError } = await q.getStaffMemberByUserId(supabase, user.id)
  if (staffError || !staff?.id) {
    return {
      success: false as const,
      error: 'Your login is not linked to an agency staff profile. Ask your agency to connect your account.',
      data: null,
    }
  }

  let fetchQuery = supabase.from('caregiver_credentials').select('id').eq('id', certificationId)
  fetchQuery = fetchQuery.eq('caregiver_member_id', staff.id)

  const { data: existing, error: fetchError } = await fetchQuery.maybeSingle()

  if (fetchError || !existing) {
    return { success: false as const, error: 'Certification not found or you do not have access.', data: null }
  }

  const expiryDate = data.expiration_date.trim()
  const { status } = computeExpiryFields(expiryDate)

  const { data: updated, error: updateError } = await supabase
    .from('caregiver_credentials')
    .update({
      source_credential_name: data.type.trim(),
      credential_number: data.license_number.trim(),
      state: (data.state?.trim() || '—') || '—',
      issue_date: data.issue_date?.trim() || null,
      expiration_date: expiryDate,
      status,
      issuing_authority: data.issuing_authority.trim(),
      document_url: data.document_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', certificationId)
    .eq('caregiver_member_id', staff.id)
    .select()
    .single()

  if (updateError) {
    return { success: false as const, error: updateError.message, data: null }
  }

  revalidatePath('/pages/caregiver/my-certifications')
  revalidatePath(`/pages/caregiver/my-certifications/${certificationId}`)
  revalidatePath('/pages/caregiver')
  return {
    success: true as const,
    error: null,
    data: updated ? mapCredentialRowToUi(updated as Parameters<typeof mapCredentialRowToUi>[0]) : null,
  }
}

export async function getMyStaffCertificationById(certificationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'You must be logged in', data: null }
  }

  const { data: staff, error: staffError } = await q.getStaffMemberByUserId(supabase, user.id)
  if (staffError || !staff?.id) {
    return { error: 'Staff profile not found', data: null }
  }

  const { data: row, error } = await supabase
    .from('caregiver_credentials')
    .select('*')
    .eq('id', certificationId)
    .eq('caregiver_member_id', staff.id)
    .maybeSingle()

  if (error) {
    return { error: error.message, data: null }
  }
  if (!row) {
    return { error: 'Not found', data: null }
  }

  return { error: null, data: mapCredentialRowToUi(row as Parameters<typeof mapCredentialRowToUi>[0]) }
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
    if (legacyResult.error) {
      return { success: false as const, error: legacyResult.error, data: null }
    }
    return { success: true as const, error: null, data: legacyResult.data }
  }
  return staffTry
}

export async function getUnifiedCaregiverCertificationDetail(certificationId: string): Promise<{
  error: string | null
  data: MyStaffCertificationUi | null
}> {
  const staffResult = await getMyStaffCertificationById(certificationId)
  if (!staffResult.error && staffResult.data) {
    return { error: null, data: staffResult.data }
  }
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
  return {
    error: staffResult.error || legacyResult.error || 'Not found',
    data: null,
  }
}
