'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { getSession } from '@/lib/auth'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import {
  CACHE_TAG_AGENCIES_FOR_BILLING,
  CACHE_TAG_AGENCIES_ID_NAME,
  CACHE_TAG_AGENCIES_ORDERED,
} from '@/lib/cache-tags'

function revalidateAgencyListCaches() {
  revalidateTag(CACHE_TAG_AGENCIES_ID_NAME)
  revalidateTag(CACHE_TAG_AGENCIES_ORDERED)
  revalidateTag(CACHE_TAG_AGENCIES_FOR_BILLING)
}

const agencyFormSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  agencyAdminIds: z.array(z.string()).default([]),
  businessType: z.string().default(''),
  taxId: z.string().default(''),
  primaryLicenseNumber: z.string().default(''),
  website: z.string().optional(),
  physicalStreetAddress: z.string().min(1, 'Physical street address is required'),
  physicalCity: z.string().min(1, 'City is required'),
  physicalState: z.string().min(1, 'State is required'),
  physicalZipCode: z.string().min(1, 'ZIP code is required'),
  sameAsPhysical: z.boolean().default(true),
  mailingStreetAddress: z.string().optional(),
  mailingCity: z.string().optional(),
  mailingState: z.string().optional(),
  mailingZipCode: z.string().optional(),
})

export type AgencyFormData = z.infer<typeof agencyFormSchema>

function buildAgencyPayload(data: Omit<AgencyFormData, 'agencyAdminIds'>) {
  return {
    name: data.companyName.trim(),
    business_type: data.businessType.trim() || null,
    tax_id: data.taxId.trim() || null,
    primary_license_number: data.primaryLicenseNumber.trim() || null,
    website: data.website?.trim() || null,
    physical_street_address: data.physicalStreetAddress.trim() || null,
    physical_city: data.physicalCity.trim() || null,
    physical_state: data.physicalState.trim() || null,
    physical_zip_code: data.physicalZipCode.trim() || null,
    same_as_physical: data.sameAsPhysical ?? true,
    mailing_street_address: data.mailingStreetAddress?.trim() || null,
    mailing_city: data.mailingCity?.trim() || null,
    mailing_state: data.mailingState?.trim() || null,
    mailing_zip_code: data.mailingZipCode?.trim() || null,
    updated_at: new Date().toISOString(),
  }
}

export async function createAgency(data: AgencyFormData) {
  const parsed = agencyFormSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', data: null }
  const validData = parsed.data
  const supabase = await createClient()
  try {
    const ids = (validData.agencyAdminIds || []).filter(Boolean)
    const { data: newAgency, error } = await q.insertAgency(supabase, {
      ...buildAgencyPayload(validData),
      agency_admin_ids: ids,
    })

    if (error) {
      return { error: error.message, data: null }
    }

    const agencyId = newAgency?.id
    const trimmedName = validData.companyName.trim()
    if (ids.length > 0) {
      const updates: { company_name: string; agency_id?: string } = { company_name: trimmedName }
      if (agencyId) updates.agency_id = agencyId
      const { error: clientError } = await q.updateClientCompanyAndAgencyForIds(supabase, ids, updates)
      // Non-blocking: agency was created. Log with context so ops team can manually fix if needed.
      if (clientError) console.error('[agencies/createAgency] Failed to set client company_name/agency_id. agencyId=%s clientIds=%j err=%s', agencyId, ids, clientError.message)
    }

    revalidatePath('/pages/admin/agencies')
    revalidatePath('/pages/expert/agencies')
    revalidateAgencyListCaches()
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err?.message || 'Failed to create agency', data: null }
  }
}

export async function updateAgency(
  id: string,
  data: AgencyFormData,
  previousAgencyAdminIds: string[]
) {
  const parsed = agencyFormSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', data: null }
  const validData = parsed.data
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabase = createAdminClient()
  try {
    const newIds = (validData.agencyAdminIds || []).filter(Boolean)
    const newSet = new Set(newIds)

    // One fetch for all peer agencies; keep admin-id arrays in memory so multiple newIds
    // removed from the same other agency stay consistent (refetch-per-clientId was redundant).
    const { data: otherAgencies } = await q.getAgenciesExceptId(supabase, id)
    const others = otherAgencies ?? []
    const adminIdsByAgency = new Map<string, string[]>(
      others.map((ag) => [ag.id, [...((ag.agency_admin_ids as string[]) || [])]])
    )

    const strippedAdminIds = new Set<string>()
    for (const clientId of newIds) {
      for (const ag of others) {
        const arr = adminIdsByAgency.get(ag.id) ?? []
        if (!arr.includes(clientId)) continue
        const updated = arr.filter((x) => x !== clientId)
        adminIdsByAgency.set(ag.id, updated)
        const { error: stripErr } = await q.updateAgencyAdminIds(supabase, ag.id, updated)
        if (stripErr) console.error('[agencies/updateAgency] Failed to strip admin from peer agency. agencyId=%s clientId=%s err=%s', ag.id, clientId, stripErr.message)
        strippedAdminIds.add(clientId)
      }
    }
    if (strippedAdminIds.size > 0) {
      const { error: clearErr } = await q.updateClientClearAgencyForIds(supabase, Array.from(strippedAdminIds))
      if (clearErr) console.error('[agencies/updateAgency] Failed to clear client agency (batch). clientIds=%j err=%s', Array.from(strippedAdminIds), clearErr.message)
    }

    const { error } = await q.updateAgencyById(supabase, id, {
      ...buildAgencyPayload(validData),
      agency_admin_ids: newIds,
    })

    if (error) {
      return { error: error.message, data: null }
    }

    const removedAdminIds = previousAgencyAdminIds.filter((clientId) => !newSet.has(clientId))
    if (removedAdminIds.length > 0) {
      const { error: removedClearErr } = await q.updateClientClearAgencyForIds(supabase, removedAdminIds)
      if (removedClearErr) console.error('[agencies/updateAgency] Failed to clear removed admins agency (batch). clientIds=%j err=%s', removedAdminIds, removedClearErr.message)
    }

    const trimmedName = validData.companyName.trim()
    if (newIds.length > 0) {
      const { error: clientError } = await q.updateClientCompanyAndAgencyForIds(supabase, newIds, {
        company_name: trimmedName,
        agency_id: id,
      })
      if (clientError) console.error('[agencies/updateAgency] Failed to set client company_name/agency_id. agencyId=%s clientIds=%j err=%s', id, newIds, clientError.message)
    }

    revalidatePath('/pages/admin/agencies')
    revalidatePath('/pages/expert/agencies')
    revalidateAgencyListCaches()
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err?.message || 'Failed to update agency', data: null }
  }
}

const companyDetailsSchema = agencyFormSchema.omit({ agencyAdminIds: true })
export type CompanyDetailsFormData = z.infer<typeof companyDetailsSchema>

export async function saveCompanyDetails(data: CompanyDetailsFormData) {
  const parsed = companyDetailsSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', data: null }
  const validData = parsed.data
  const supabase = await createClient()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return { error: 'Not authenticated', data: null }
    }

    const { data: client, error: clientError } = await q.getClientByCompanyOwnerId(supabase, user.id)

    if (clientError || !client) {
      return { error: 'No client record found for your account.', data: null }
    }

    const payload = {
      name: validData.companyName.trim(),
      business_type: validData.businessType.trim() || null,
      tax_id: validData.taxId.trim() || null,
      primary_license_number: validData.primaryLicenseNumber.trim() || null,
      website: validData.website?.trim() || null,
      physical_street_address: validData.physicalStreetAddress.trim() || null,
      physical_city: validData.physicalCity.trim() || null,
      physical_state: validData.physicalState.trim() || null,
      physical_zip_code: validData.physicalZipCode.trim() || null,
      same_as_physical: validData.sameAsPhysical ?? true,
      mailing_street_address: validData.mailingStreetAddress?.trim() || null,
      mailing_city: validData.mailingCity?.trim() || null,
      mailing_state: validData.mailingState?.trim() || null,
      mailing_zip_code: validData.mailingZipCode?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { data: existingAgency } = await q.getAgencyByAdminId(supabase, client.id)

    if (existingAgency) {
      const { error: updateError } = await q.updateAgencyById(supabase, existingAgency.id, payload)

      if (updateError) {
        return { error: updateError.message, data: null }
      }
      await q.updateClientAgencyId(supabase, client.id, existingAgency.id)
    } else {
      const { data: newAgency, error: insertError } = await q.insertAgencyWithAdmin(supabase, {
        ...payload,
        agency_admin_ids: [client.id],
      })

      if (insertError) {
        return { error: insertError.message, data: null }
      }
      if (newAgency?.id) {
        await q.updateClientAgencyId(supabase, client.id, newAgency.id)
      }
    }

    const { error: clientUpdateError } = await q.updateClientCompanyName(supabase, client.id, validData.companyName.trim())

    if (clientUpdateError) {
      console.error('Failed to update client company_name:', clientUpdateError)
    }

    revalidatePath('/pages/agency/profile')
    revalidateAgencyListCaches()
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err?.message || 'Failed to save company details', data: null }
  }
}

function revalidateAgencyDetailPages() {
  revalidatePath('/pages/admin/agencies/[id]', 'page')
  revalidatePath('/pages/expert/agencies/[id]', 'page')
}

/** Admin/expert: assign an existing agency_admin to this agency. */
export async function addAdminToAgency(agencyId: string, adminId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabaseAdmin = createAdminClient()
  try {
    const { data: agency, error: fetchErr } = await q.getAgencyById(supabaseAdmin, agencyId)
    if (fetchErr || !agency) return { error: 'Agency not found', data: null }

    const currentIds = normalizeAgencyAdminIds(agency.agency_admin_ids as string[] | string | null)
    if (currentIds.includes(adminId)) return { error: null, data: { success: true } }

    // Strip this admin from any other agency they're currently assigned to
    const { data: otherAgencies } = await q.getAgenciesExceptId(supabaseAdmin, agencyId)
    for (const other of otherAgencies ?? []) {
      const otherIds = normalizeAgencyAdminIds(other.agency_admin_ids as string[] | string | null)
      if (otherIds.includes(adminId)) {
        await q.updateAgencyAdminIds(supabaseAdmin, other.id, otherIds.filter((id) => id !== adminId))
      }
    }

    const newIds = [...currentIds, adminId]
    const { error: updateAgencyErr } = await q.updateAgencyAdminIds(supabaseAdmin, agencyId, newIds)
    if (updateAgencyErr) return { error: updateAgencyErr.message, data: null }

    const { error: updateAdminErr } = await q.updateClientCompanyAndAgencyForIds(supabaseAdmin, [adminId], {
      company_name: agency.name,
      agency_id: agencyId,
    })
    if (updateAdminErr) console.error('Failed to update agency_admins record:', updateAdminErr)

    revalidateAgencyDetailPages()
    revalidateAgencyListCaches()
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err?.message || 'Failed to add admin', data: null }
  }
}

/** Admin/expert: remove an agency_admin from this agency. */
export async function removeAdminFromAgency(agencyId: string, adminId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabaseAdmin = createAdminClient()
  try {
    const { data: agency, error: fetchErr } = await q.getAgencyById(supabaseAdmin, agencyId)
    if (fetchErr || !agency) return { error: 'Agency not found', data: null }

    const currentIds = normalizeAgencyAdminIds(agency.agency_admin_ids as string[] | string | null)
    const newIds = currentIds.filter((id) => id !== adminId)

    const { error: updateAgencyErr } = await q.updateAgencyAdminIds(supabaseAdmin, agencyId, newIds)
    if (updateAgencyErr) return { error: updateAgencyErr.message, data: null }

    const { error: clearErr } = await q.updateClientClearAgencyForIds(supabaseAdmin, [adminId])
    if (clearErr) console.error('Failed to clear agency_admins record:', clearErr)

    revalidateAgencyDetailPages()
    revalidateAgencyListCaches()
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err?.message || 'Failed to remove admin', data: null }
  }
}
