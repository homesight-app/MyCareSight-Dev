'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'

function revalidateLeadPaths() {
  revalidatePath('/pages/admin/leads')
  revalidatePath('/pages/agency/leads')
}

function revalidateLeadDetail(leadId: string) {
  revalidatePath(`/pages/admin/leads/${leadId}`)
  revalidatePath(`/pages/agency/leads/${leadId}`)
}

async function requirePlatformStaff() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', session: null }
  return { error: null, session }
}

async function requireAgencyMember() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') return { error: 'Forbidden', session: null }
  return { error: null, session }
}

// ——— Create / Update ————————————————————————————————————————

export async function createLead(payload: {
  leadType: 'agency' | 'patient'
  agencyId?: string
  contactFirstName: string
  contactLastName: string
  contactEmail?: string
  contactPhone?: string
  companyName?: string
  serviceType?: string
  stage?: string
  price?: number | null
  retainerAmount?: number | null
  retainerPaidDate?: string | null
  installments?: number | null
  installmentAmount?: number | null
  signedDate?: string | null
  notes?: string
  assignedTo?: string | null
  source?: string
  convertedAgencyId?: string | null
}) {
  let userId: string

  if (payload.leadType === 'agency') {
    const { error: authErr, session } = await requirePlatformStaff()
    if (authErr || !session) return { error: authErr ?? 'Forbidden' }
    userId = session.user.id
  } else {
    const { error: authErr, session } = await requireAgencyMember()
    if (authErr || !session) return { error: authErr ?? 'Forbidden' }
    userId = session.user.id
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leads')
    .insert({
      lead_type: payload.leadType,
      agency_id: payload.agencyId ?? null,
      created_by: userId,
      assigned_to: payload.assignedTo ?? null,
      contact_first_name: payload.contactFirstName,
      contact_last_name: payload.contactLastName,
      contact_email: payload.contactEmail ?? null,
      contact_phone: payload.contactPhone ?? null,
      company_name: payload.companyName ?? null,
      service_type: payload.serviceType ?? null,
      stage: payload.stage ?? 'new',
      price: payload.price ?? null,
      retainer_amount: payload.retainerAmount ?? null,
      retainer_paid_date: payload.retainerPaidDate ?? null,
      installments: payload.installments ?? null,
      installment_amount: payload.installmentAmount ?? null,
      signed_date: payload.signedDate ?? null,
      notes: payload.notes ?? null,
      source: payload.source ?? null,
      converted_agency_id: payload.convertedAgencyId ?? null,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidateLeadPaths()
  return { error: null, leadId: data.id }
}

export async function updateLead(
  leadId: string,
  payload: {
    contactFirstName?: string
    contactLastName?: string
    contactEmail?: string
    contactPhone?: string
    companyName?: string
    serviceType?: string
    price?: number | null
    retainerAmount?: number | null
    retainerPaidDate?: string | null
    installments?: number | null
    installmentAmount?: number | null
    signedDate?: string | null
    notes?: string | null
    assignedTo?: string | null
    source?: string | null
    convertedAgencyId?: string | null
  }
) {
  const supabase = await createClient()
  const updateData: Record<string, unknown> = {
    contact_first_name: payload.contactFirstName,
    contact_last_name: payload.contactLastName,
    contact_email: payload.contactEmail,
    contact_phone: payload.contactPhone,
    company_name: payload.companyName,
    service_type: payload.serviceType,
    price: payload.price,
    retainer_amount: payload.retainerAmount,
    retainer_paid_date: payload.retainerPaidDate,
    installments: payload.installments,
    installment_amount: payload.installmentAmount,
    signed_date: payload.signedDate,
    notes: payload.notes,
    assigned_to: payload.assignedTo,
    updated_at: new Date().toISOString(),
  }
  if (payload.source !== undefined) updateData.source = payload.source
  if ('convertedAgencyId' in payload) updateData.converted_agency_id = payload.convertedAgencyId ?? null

  const { error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', leadId)

  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function updateLeadStage(leadId: string, stage: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  revalidateLeadPaths()
  return { error: null }
}

export async function archiveLead(leadId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) return { error: error.message }
  revalidateLeadPaths()
  return { error: null }
}

// ——— Notes ——————————————————————————————————————————————————

export async function addLeadNote(
  leadId: string,
  payload: { content: string; noteType: string }
) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lead_notes')
    .insert({
      lead_id: leadId,
      author_id: session.user.id,
      content: payload.content,
      note_type: payload.noteType,
    })

  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function deleteLeadNote(leadId: string, noteId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('lead_notes').delete().eq('id', noteId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

// ——— Tasks ——————————————————————————————————————————————————

export async function addLeadTask(
  leadId: string,
  payload: { title: string; dueDate?: string | null; assignedTo?: string | null }
) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lead_tasks')
    .insert({
      lead_id: leadId,
      created_by: session.user.id,
      assigned_to: payload.assignedTo ?? null,
      title: payload.title,
      due_date: payload.dueDate ?? null,
      updated_at: new Date().toISOString(),
    })

  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function completeLeadTask(leadId: string, taskId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lead_tasks')
    .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function uncompleteLeadTask(leadId: string, taskId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lead_tasks')
    .update({ completed_at: null, updated_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function deleteLeadTask(leadId: string, taskId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('lead_tasks').delete().eq('id', taskId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

// ——— Conversion ——————————————————————————————————————————————

export async function convertLeadToAgency(leadId: string, agencyNameOverride?: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: lead, error: fetchErr } = await supabase
    .from('leads')
    .select('id, lead_type, stage, converted_agency_id, converted_at, company_name')
    .eq('id', leadId)
    .single()

  if (fetchErr || !lead) return { error: 'Lead not found' }
  if (lead.lead_type !== 'agency') return { error: 'Not an agency lead' }
  if (lead.converted_agency_id && lead.converted_at) return { error: 'Already converted' }
  if (lead.stage !== 'signed') return { error: 'Lead must be at the Signed stage before converting to an agency' }

  const agencyName = agencyNameOverride?.trim() || lead.company_name?.trim()
  if (!agencyName) return { error: 'NEEDS_AGENCY_NAME' }

  const { data: agency, error: agencyErr } = await supabaseAdmin
    .from('agencies')
    .insert({
      name: agencyName,
      onboarding_status: 'shell',
      status: 'active',
      state_specific_data: {},
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (agencyErr || !agency) return { error: agencyErr?.message ?? 'Failed to create agency' }

  const { error: updateErr } = await supabase
    .from('leads')
    .update({
      converted_agency_id: agency.id,
      converted_at: new Date().toISOString(),
      stage: 'signed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (updateErr) return { error: updateErr.message }

  revalidateLeadDetail(leadId)
  revalidatePath('/pages/admin/agencies')
  return { error: null, agencyId: agency.id }
}

export async function linkLeadToExistingAgency(leadId: string, agencyId: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { error } = await q.linkLeadToExistingAgency(supabase, leadId, agencyId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function unlinkLeadFromAgency(leadId: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { error } = await q.unlinkLeadFromAgency(supabase, leadId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function uploadLeadDocument(
  leadId: string,
  formData: FormData
): Promise<{ error: string | null; doc?: { id: string; document_name: string; file_url: string } }> {
  const { error: authErr, session } = await requirePlatformStaff()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const file = formData.get('file') as File | null
  const documentName = formData.get('document_name') as string | null
  const documentType = formData.get('document_type') as string | null

  if (!file || !documentName?.trim()) return { error: 'File and document name are required' }

  const supabase = await createClient()
  const ext = file.name.split('.').pop()
  const filePath = `${leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET.LEAD).upload(filePath, file)
  if (uploadErr) return { error: uploadErr.message }

  const { data, error: insertErr } = await q.insertLeadDocument(supabase, {
    lead_id: leadId,
    document_name: documentName.trim(),
    file_url: filePath,
    file_name: file.name,
    document_type: documentType ?? null,
    uploaded_by: session.user.id,
  })

  if (insertErr) {
    await supabase.storage.from(STORAGE_BUCKET.LEAD).remove([filePath])
    return { error: insertErr.message }
  }

  revalidateLeadDetail(leadId)
  return { error: null, doc: { id: data!.id, document_name: documentName.trim(), file_url: filePath } }
}

export async function deleteLeadDocumentAction(leadId: string, docId: string, filePath: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  await supabase.storage.from(STORAGE_BUCKET.LEAD).remove([filePath])
  const { error } = await q.deleteLeadDocument(supabase, docId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function linkLeadToPatient(leadId: string, patientId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({
      converted_client_id: patientId,
      converted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}
