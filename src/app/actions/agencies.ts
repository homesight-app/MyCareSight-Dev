'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { getSession } from '@/lib/auth'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'
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
  physicalStreetAddress: z.string().default(''),
  physicalCity: z.string().default(''),
  physicalState: z.string().default(''),
  physicalZipCode: z.string().default(''),
  sameAsPhysical: z.boolean().default(true),
  mailingStreetAddress: z.string().optional(),
  mailingCity: z.string().optional(),
  mailingState: z.string().optional(),
  mailingZipCode: z.string().optional(),
  // Onboarding / profile extension fields (migrations 112 + 113)
  dbaName: z.string().optional(),
  hoursOfOperation: z.string().optional(),
  faxNumber: z.string().optional(),
  dateOfFormation: z.string().optional(),
  npi: z.string().optional(),
  stateSpecificData: z.record(z.string(), z.unknown()).optional(),
  phoneNumber: z.string().optional(),
  agencyEmail: z.string().optional(),
  regionServiceArea: z.string().optional(),
  isOnCall: z.boolean().optional(),
  previouslyLicensed: z.boolean().optional(),
  prevLicenseClosedDate: z.string().optional(),
  // Legal entity fields (migration 122)
  legalEntityName: z.string().optional(),
  entityType: z.string().optional(),
  stateOfIncorporation: z.string().optional(),
  dateOfIncorporation: z.string().optional(),
  licensedOfficeStreet: z.string().optional(),
  licensedOfficeCity: z.string().optional(),
  licensedOfficeState: z.string().optional(),
  licensedOfficeZip: z.string().optional(),
  licensedSameAsPhysical: z.boolean().optional(),
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
    dba_name: data.dbaName?.trim() || null,
    hours_of_operation: data.hoursOfOperation?.trim() || null,
    fax_number: data.faxNumber?.trim() || null,
    date_of_formation: data.dateOfFormation || null,
    npi: data.npi?.trim() || null,
    state_specific_data: data.stateSpecificData ?? undefined,
    phone_number: data.phoneNumber?.trim() || null,
    email: data.agencyEmail?.trim() || null,
    region_service_area: data.regionServiceArea?.trim() || null,
    is_on_call: data.isOnCall ?? null,
    previously_licensed: data.previouslyLicensed ?? null,
    prev_license_closed_date: data.prevLicenseClosedDate || null,
    legal_entity_name: data.legalEntityName?.trim() || null,
    entity_type: data.entityType?.trim() || null,
    state_of_incorporation: data.stateOfIncorporation?.trim().toUpperCase() || null,
    date_of_incorporation: data.dateOfIncorporation || null,
    licensed_office_street: data.licensedOfficeStreet?.trim() || null,
    licensed_office_city: data.licensedOfficeCity?.trim() || null,
    licensed_office_state: data.licensedOfficeState?.trim().toUpperCase() || null,
    licensed_office_zip: data.licensedOfficeZip?.trim() || null,
    licensed_same_as_physical: data.licensedSameAsPhysical ?? false,
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
      legal_entity_name: validData.legalEntityName?.trim() || null,
      entity_type: validData.entityType?.trim() || null,
      state_of_incorporation: validData.stateOfIncorporation?.trim().toUpperCase() || null,
      date_of_incorporation: validData.dateOfIncorporation || null,
      licensed_office_street: validData.licensedOfficeStreet?.trim() || null,
      licensed_office_city: validData.licensedOfficeCity?.trim() || null,
      licensed_office_state: validData.licensedOfficeState?.trim().toUpperCase() || null,
      licensed_office_zip: validData.licensedOfficeZip?.trim() || null,
      licensed_same_as_physical: validData.licensedSameAsPhysical ?? false,
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

/** Platform staff: create a name-only "shell" agency for the onboarding flow. */
export async function createShellAgency(name: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Agency name is required', data: null }

  const supabase = createAdminClient()
  try {
    const { data: newAgency, error } = await q.insertAgency(supabase, {
      name: trimmed,
      onboarding_status: 'shell',
      agency_admin_ids: [],
    })
    if (error) return { error: error.message, data: null }

    revalidatePath('/pages/admin/agencies')
    revalidatePath('/pages/expert/agencies')
    revalidateAgencyListCaches()
    return { error: null, data: { agencyId: newAgency!.id } }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create agency', data: null }
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

/** Admin/expert: set an agency's status to 'active' or 'inactive'. */
export async function setAgencyStatus(agencyId: string, status: 'active' | 'inactive') {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', data: null }

  const supabase = createAdminClient()
  try {
    const { error } = await supabase
      .from('agencies')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', agencyId)
    if (error) return { error: error.message, data: null }
    revalidateAgencyDetailPages()
    revalidateAgencyListCaches()
    return { error: null, data: { success: true } }
  } catch (err: any) {
    return { error: err?.message || 'Failed to update agency status', data: null }
  }
}

// ——— Agency Notes ————————————————————————————————————————————

export async function addAgencyNote(
  agencyId: string,
  payload: { content: string; noteType: string }
) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('agency_notes').insert({
    agency_id: agencyId,
    author_id: session.user.id,
    content: payload.content,
    note_type: payload.noteType,
  })

  if (error) return { error: error.message }
  revalidateAgencyDetailPages()
  return { error: null }
}

export async function deleteAgencyNote(agencyId: string, noteId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('agency_notes').delete().eq('id', noteId)
  if (error) return { error: error.message }
  revalidateAgencyDetailPages()
  return { error: null }
}

// ——— Agency Documents ————————————————————————————————————————

export async function uploadAgencyDocument(
  agencyId: string,
  formData: FormData
): Promise<{ error: string | null; doc?: { id: string; document_name: string; file_url: string } }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const file = formData.get('file') as File | null
  const documentName = formData.get('document_name') as string | null
  const documentType = formData.get('document_type') as string | null

  if (!file || !documentName?.trim()) return { error: 'File and document name are required' }

  const supabase = await createClient()
  const ext = file.name.split('.').pop()
  const filePath = `${agencyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET.AGENCY).upload(filePath, file)
  if (uploadErr) return { error: uploadErr.message }

  const { data, error: insertErr } = await q.insertAgencyDocument(supabase, {
    agency_id: agencyId,
    document_name: documentName.trim(),
    file_url: filePath,
    file_name: file.name,
    document_type: documentType ?? null,
    uploaded_by: session.user.id,
  })

  if (insertErr) {
    const { error: cleanupErr } = await supabase.storage.from(STORAGE_BUCKET.AGENCY).remove([filePath])
    if (cleanupErr) console.error('[agencies/uploadAgencyDocument] Storage cleanup failed. path=%s err=%s', filePath, cleanupErr.message)
    return { error: insertErr.message }
  }

  revalidateAgencyDetailPages()
  return { error: null, doc: { id: data!.id, document_name: documentName.trim(), file_url: filePath } }
}

export async function deleteAgencyDocumentAction(agencyId: string, docId: string, filePath: string) {
  const supabase = await createClient()
  const { error: storageErr } = await supabase.storage.from(STORAGE_BUCKET.AGENCY).remove([filePath])
  if (storageErr) console.error('[agencies/deleteAgencyDocument] Storage delete failed. path=%s err=%s', filePath, storageErr.message)
  const { error } = await q.deleteAgencyDocument(supabase, docId)
  if (error) return { error: error.message }
  revalidateAgencyDetailPages()
  return { error: null }
}
