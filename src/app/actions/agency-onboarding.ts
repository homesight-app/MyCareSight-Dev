'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'
import * as q from '@/lib/supabase/query'
import { sendOnboardingLinkEmail } from '@/lib/email'
import { encryptSSN, ssnToLast4 } from '@/lib/ssn-crypto'

const keyStaffEntrySchema = z.object({
  full_legal_name: z.string().optional(),
  telephone: z.string().optional(),
  email: z.string().optional(),
})

const memberOwnerEntrySchema = z.object({
  full_legal_name: z.string().optional(),
  telephone: z.string().optional(),
  email: z.string().optional(),
})

const onboardingFormSchema = z.object({
  name: z.string().min(1, 'Agency name is required'),
  dba_name: z.string().optional(),
  hours_of_operation: z.string().optional(),
  date_of_formation: z.string().optional(),
  npi: z.string().optional(),
  tax_id: z.string().optional(),
  fax_number: z.string().optional(),
  website: z.string().optional(),
  phone_number: z.string().optional(),
  email: z.string().optional(),
  region_service_area: z.string().optional(),
  is_on_call: z.boolean().optional(),
  previously_licensed: z.boolean().optional(),
  prev_license_closed_date: z.string().optional(),
  physical_street_address: z.string().min(1, 'Physical street address is required'),
  physical_city: z.string().min(1, 'City is required'),
  physical_state: z.string().min(1, 'State is required'),
  physical_zip_code: z.string().min(1, 'ZIP code is required'),
  same_as_physical: z.boolean().default(true),
  mailing_street_address: z.string().optional(),
  mailing_city: z.string().optional(),
  mailing_state: z.string().optional(),
  mailing_zip_code: z.string().optional(),
  // Legal entity fields (migration 122)
  legal_entity_name: z.string().optional(),
  entity_type: z.string().optional(),
  state_of_incorporation: z.string().optional(),
  date_of_incorporation: z.string().optional(),
  licensed_office_street: z.string().optional(),
  licensed_office_city: z.string().optional(),
  licensed_office_state: z.string().optional(),
  licensed_office_zip: z.string().optional(),
  licensed_same_as_physical: z.boolean().optional(),
  state_specific_data: z.record(z.string(), z.unknown()).optional(),
  key_staff: z.record(z.string(), keyStaffEntrySchema).optional(),
  member_owners: z.array(memberOwnerEntrySchema).optional(),
})

export type OnboardingFormData = z.infer<typeof onboardingFormSchema>

function revalidateAgencyDetailPages(agencyId: string) {
  revalidatePath(`/pages/admin/agencies/${agencyId}`)
  revalidatePath(`/pages/expert/agencies/${agencyId}`)
  revalidatePath(`/pages/agency/people`)
}

export async function generateOnboardingToken(
  agencyId: string,
  options: { expiresInDays?: number; note?: string; recipientEmail?: string }
) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabase = createAdminClient()
  const expiresInDays = options.expiresInDays ?? 7
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    await q.expireTokensForAgency(supabase, agencyId)

    const { data: token, error: tokenError } = await q.insertOnboardingToken(supabase, {
      agency_id: agencyId,
      created_by: session.user.id,
      expires_at: expiresAt,
      note: options.note?.trim() || null,
    })
    if (tokenError || !token) return { error: tokenError?.message ?? 'Failed to create token', data: null }

    await supabase.from('agencies').update({ onboarding_status: 'link_sent' }).eq('id', agencyId)

    if (options.recipientEmail?.trim()) {
      const { data: agencyData } = await supabase.from('agencies').select('name').eq('id', agencyId).single()
      const link = `${process.env.NEXT_PUBLIC_APP_URL}/pages/onboarding/${token.token}`
      const expiresAtFormatted = new Date(expiresAt).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
      await sendOnboardingLinkEmail({
        to: options.recipientEmail.trim(),
        agencyName: agencyData?.name ?? 'Your Agency',
        link,
        expiresAt: expiresAtFormatted,
        note: options.note?.trim(),
      })
    }

    revalidateAgencyDetailPages(agencyId)
    return { error: null, data: token }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to generate token', data: null }
  }
}

export async function revokeOnboardingToken(agencyId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabase = createAdminClient()
  try {
    await q.expireTokensForAgency(supabase, agencyId)
    revalidateAgencyDetailPages(agencyId)
    return { error: null, data: { success: true } }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to revoke token', data: null }
  }
}

export async function submitOnboardingForm(tokenValue: string, formData: OnboardingFormData) {
  const parsed = onboardingFormSchema.safeParse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid form data', data: null }
  const data = parsed.data

  const supabase = createAdminClient()
  try {
    const { data: token, error: tokenError } = await q.getOnboardingTokenByValue(supabase, tokenValue)
    if (tokenError || !token) return { error: 'Invalid or expired link', data: null }
    if (new Date(token.expires_at) <= new Date()) return { error: 'This link has expired', data: null }

    const agencyId = token.agency_id

    const isComplete = !!(
      data.physical_street_address &&
      data.physical_city &&
      data.physical_state &&
      data.physical_zip_code &&
      data.npi &&
      data.tax_id
    )

    const agencyPayload: Record<string, unknown> = {
      name: data.name.trim(),
      dba_name: data.dba_name?.trim() || null,
      hours_of_operation: data.hours_of_operation?.trim() || null,
      date_of_formation: data.date_of_formation || null,
      npi: data.npi?.trim() || null,
      tax_id: data.tax_id?.trim() || null,
      fax_number: data.fax_number?.trim() || null,
      website: data.website?.trim() || null,
      phone_number: data.phone_number?.trim() || null,
      email: data.email?.trim() || null,
      region_service_area: data.region_service_area?.trim() || null,
      is_on_call: data.is_on_call ?? null,
      previously_licensed: data.previously_licensed ?? null,
      prev_license_closed_date: data.prev_license_closed_date || null,
      physical_street_address: data.physical_street_address.trim(),
      physical_city: data.physical_city.trim(),
      physical_state: data.physical_state.trim(),
      physical_zip_code: data.physical_zip_code.trim(),
      same_as_physical: data.same_as_physical ?? true,
      mailing_street_address: data.mailing_street_address?.trim() || null,
      mailing_city: data.mailing_city?.trim() || null,
      mailing_state: data.mailing_state?.trim() || null,
      mailing_zip_code: data.mailing_zip_code?.trim() || null,
      legal_entity_name: data.legal_entity_name?.trim() || null,
      entity_type: data.entity_type?.trim() || null,
      state_of_incorporation: data.state_of_incorporation?.trim().toUpperCase() || null,
      date_of_incorporation: data.date_of_incorporation || null,
      licensed_office_street: data.licensed_office_street?.trim() || null,
      licensed_office_city: data.licensed_office_city?.trim() || null,
      licensed_office_state: data.licensed_office_state?.trim().toUpperCase() || null,
      licensed_office_zip: data.licensed_office_zip?.trim() || null,
      licensed_same_as_physical: data.licensed_same_as_physical ?? false,
      state_specific_data: data.state_specific_data ?? {},
      onboarding_status: isComplete ? 'completed' : 'partial',
      updated_at: new Date().toISOString(),
    }

    const { error: agencyError } = await supabase.from('agencies').update(agencyPayload).eq('id', agencyId)
    if (agencyError) return { error: agencyError.message, data: null }

    // Upsert officer key staff (single row per role)
    if (data.key_staff) {
      for (const [role, staffData] of Object.entries(data.key_staff)) {
        const hasAnyData = staffData.full_legal_name?.trim() || staffData.telephone?.trim() || staffData.email?.trim()
        if (!hasAnyData) continue
        await q.upsertKeyStaffMember(supabase, agencyId, role, {
          full_legal_name: staffData.full_legal_name?.trim() || null,
          telephone: staffData.telephone?.trim() || null,
          email: staffData.email?.trim() || null,
        })
      }
    }

    // Insert member/owner rows (multiple allowed — deactivate old ones first, then insert fresh)
    if (data.member_owners && data.member_owners.length > 0) {
      await supabase
        .from('agency_key_staff')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('agency_id', agencyId)
        .eq('officer_role', 'member_owner')
        .eq('status', 'active')

      for (const owner of data.member_owners) {
        const hasAnyData = owner.full_legal_name?.trim() || owner.telephone?.trim() || owner.email?.trim()
        if (!hasAnyData) continue
        await q.insertKeyStaffMember(supabase, agencyId, 'member_owner', {
          full_legal_name: owner.full_legal_name?.trim() || null,
          telephone: owner.telephone?.trim() || null,
          email: owner.email?.trim() || null,
        })
      }
    }

    await q.incrementTokenUseCount(supabase, token.id, token.use_count)

    return { error: null, data: { success: true, agencyId } }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to submit form', data: null }
  }
}

export async function saveKeyStaffAdmin(
  agencyId: string,
  officerRole: string,
  payload: {
    full_legal_name?: string
    telephone?: string
    email?: string
    date_of_birth?: string
    ssn?: string
    home_address_street?: string
    home_address_city?: string
    home_address_state?: string
    home_address_zip?: string
    date_of_hire?: string
    is_licensed?: boolean
    license_type?: string
    ownership_percentage?: string
    professional_license_number?: string
    employment_type?: string
  }
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }

  const supabase = createAdminClient()
  try {
    const clean: Record<string, unknown> = {
      full_legal_name: payload.full_legal_name?.trim() || null,
      telephone: payload.telephone?.trim() || null,
      email: payload.email?.trim() || null,
      date_of_birth: payload.date_of_birth || null,
      home_address_street: payload.home_address_street?.trim() || null,
      home_address_city: payload.home_address_city?.trim() || null,
      home_address_state: payload.home_address_state?.trim() || null,
      home_address_zip: payload.home_address_zip?.trim() || null,
      date_of_hire: payload.date_of_hire || null,
      is_licensed: payload.is_licensed ?? null,
      license_type: payload.license_type?.trim() || null,
      ownership_percentage: payload.ownership_percentage?.trim() || null,
      professional_license_number: payload.professional_license_number?.trim() || null,
      employment_type: payload.employment_type?.trim() || null,
    }

    const rawSsn = payload.ssn?.replace(/\D/g, '')
    if (rawSsn && rawSsn.length >= 4) {
      clean.ssn_encrypted = encryptSSN(rawSsn)
      clean.ssn_last4 = ssnToLast4(rawSsn)
    }

    const { data, error } = await q.upsertKeyStaffMember(supabase, agencyId, officerRole, clean)
    if (error) return { error: error.message, data: null }

    await supabase.from('audit_log').insert({
      agency_id: agencyId,
      table_name: 'agency_key_staff',
      record_id: data?.id ?? null,
      action: 'CREATE_KEY_STAFF',
      performed_by_user_id: session.user.id,
      details: { officer_role: officerRole, full_legal_name: payload.full_legal_name?.trim() },
    })

    revalidateAgencyDetailPages(agencyId)
    return { error: null, data }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to save key staff', data: null }
  }
}

export async function removeKeyStaff(agencyId: string, staffId: string) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }

  const supabase = createAdminClient()
  try {
    const { error } = await q.deactivateKeyStaffById(supabase, staffId)
    if (error) return { error: error.message, data: null }

    await supabase.from('audit_log').insert({
      agency_id: agencyId,
      table_name: 'agency_key_staff',
      record_id: staffId,
      action: 'DEACTIVATE_KEY_STAFF',
      performed_by_user_id: session.user.id,
      details: {},
    })

    revalidateAgencyDetailPages(agencyId)
    return { error: null, data: { success: true } }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to remove key staff', data: null }
  }
}

export async function updateMemberOwner(
  staffId: string,
  agencyId: string,
  payload: {
    full_legal_name?: string
    telephone?: string
    email?: string
    ownership_percentage?: string
    date_of_birth?: string
    ssn?: string
    home_address_street?: string
    home_address_city?: string
    home_address_state?: string
    home_address_zip?: string
  }
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }

  const supabase = createAdminClient()
  try {
    const clean: Record<string, unknown> = {
      full_legal_name: payload.full_legal_name?.trim() || null,
      telephone: payload.telephone?.trim() || null,
      email: payload.email?.trim() || null,
      ownership_percentage: payload.ownership_percentage?.trim() || null,
      date_of_birth: payload.date_of_birth || null,
      home_address_street: payload.home_address_street?.trim() || null,
      home_address_city: payload.home_address_city?.trim() || null,
      home_address_state: payload.home_address_state?.trim() || null,
      home_address_zip: payload.home_address_zip?.trim() || null,
    }

    const rawSsn = payload.ssn?.replace(/\D/g, '')
    if (rawSsn && rawSsn.length >= 4) {
      clean.ssn_encrypted = encryptSSN(rawSsn)
      clean.ssn_last4 = ssnToLast4(rawSsn)
    }

    const { data, error } = await q.updateKeyStaffById(supabase, staffId, clean)
    if (error) return { error: error.message, data: null }

    await supabase.from('audit_log').insert({
      agency_id: agencyId,
      table_name: 'agency_key_staff',
      record_id: staffId,
      action: 'UPDATE_KEY_STAFF',
      performed_by_user_id: session.user.id,
      details: { changed_fields: Object.keys(payload).filter(k => k !== 'ssn') },
    })

    revalidateAgencyDetailPages(agencyId)
    return { error: null, data }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update member/owner', data: null }
  }
}

export async function addMemberOwner(
  agencyId: string,
  payload: {
    full_legal_name?: string
    telephone?: string
    email?: string
    ownership_percentage?: string
    date_of_birth?: string
    ssn?: string
    home_address_street?: string
    home_address_city?: string
    home_address_state?: string
    home_address_zip?: string
  }
) {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }

  const supabase = createAdminClient()
  try {
    const clean: Record<string, unknown> = {
      full_legal_name: payload.full_legal_name?.trim() || null,
      telephone: payload.telephone?.trim() || null,
      email: payload.email?.trim() || null,
      ownership_percentage: payload.ownership_percentage?.trim() || null,
      date_of_birth: payload.date_of_birth || null,
      home_address_street: payload.home_address_street?.trim() || null,
      home_address_city: payload.home_address_city?.trim() || null,
      home_address_state: payload.home_address_state?.trim() || null,
      home_address_zip: payload.home_address_zip?.trim() || null,
    }

    const rawSsn = payload.ssn?.replace(/\D/g, '')
    if (rawSsn && rawSsn.length >= 4) {
      clean.ssn_encrypted = encryptSSN(rawSsn)
      clean.ssn_last4 = ssnToLast4(rawSsn)
    }

    const { data, error } = await q.insertKeyStaffMember(supabase, agencyId, 'member_owner', clean)
    if (error) return { error: error.message, data: null }

    await supabase.from('audit_log').insert({
      agency_id: agencyId,
      table_name: 'agency_key_staff',
      record_id: data?.id ?? null,
      action: 'CREATE_MEMBER_OWNER',
      performed_by_user_id: session.user.id,
      details: { ownership_percentage: payload.ownership_percentage?.trim(), full_legal_name: payload.full_legal_name?.trim() },
    })

    revalidateAgencyDetailPages(agencyId)
    return { error: null, data }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to add member/owner', data: null }
  }
}

export async function updateKeyStaffById(
  agencyId: string,
  staffId: string,
  data: { full_legal_name?: string; telephone?: string; email?: string; officer_role?: string }
): Promise<{ error: string | null }> {
  const { error: authErr, session } = await requirePlatformStaffOrAgencyRole(agencyId)
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agency_key_staff')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', staffId)
    .eq('agency_id', agencyId)
  if (error) return { error: error.message }

  const changedFields = Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined)
  await supabase.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'agency_key_staff',
    record_id: staffId,
    action: 'UPDATE_KEY_STAFF',
    performed_by_user_id: session.user.id,
    details: { changed_fields: changedFields },
  })

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}
