'use server'

import { revalidatePath } from 'next/cache'
import sql from '@/db'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'
import { uploadFile, removeFiles } from '@/lib/storage/client'

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
  leadOwnerId?: string | null
  serviceStates?: string[] | null
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

  try {
    const [data] = await sql<{ id: string }[]>`
      INSERT INTO leads (
        lead_type, agency_id, created_by, assigned_to,
        contact_first_name, contact_last_name, contact_email, contact_phone,
        company_name, service_type, stage, price,
        retainer_amount, retainer_paid_date, installments, installment_amount,
        signed_date, notes, source, converted_agency_id, lead_owner_id,
        service_states, status, updated_at
      ) VALUES (
        ${payload.leadType}, ${payload.agencyId ?? null}, ${userId}, ${payload.assignedTo ?? null},
        ${payload.contactFirstName}, ${payload.contactLastName}, ${payload.contactEmail ?? null}, ${payload.contactPhone ?? null},
        ${payload.companyName ?? null}, ${payload.serviceType ?? null}, ${payload.stage ?? 'new'}, ${payload.price ?? null},
        ${payload.retainerAmount ?? null}, ${payload.retainerPaidDate ?? null}, ${payload.installments ?? null}, ${payload.installmentAmount ?? null},
        ${payload.signedDate ?? null}, ${payload.notes ?? null}, ${payload.source ?? null}, ${payload.convertedAgencyId ?? null}, ${payload.leadOwnerId ?? null},
        ${payload.serviceStates ?? null}, 'active', ${new Date().toISOString()}
      )
      RETURNING id
    `
    if (!data) return { error: 'Insert failed' }
    revalidateLeadPaths()
    return { error: null, leadId: data.id }
  } catch (err: any) {
    return { error: err.message || 'Failed to create lead' }
  }
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
    leadOwnerId?: string | null
    proposalSentDate?: string | null
    serviceStates?: string[] | null
  }
) {
  const raw: Record<string, unknown> = {
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
  if (payload.source !== undefined)            raw.source = payload.source
  if ('convertedAgencyId' in payload)          raw.converted_agency_id = payload.convertedAgencyId ?? null
  if ('leadOwnerId' in payload)               raw.lead_owner_id = payload.leadOwnerId ?? null
  if ('proposalSentDate' in payload)          raw.proposal_sent_date = payload.proposalSentDate ?? null
  if ('serviceStates' in payload)             raw.service_states = payload.serviceStates ?? null

  // Drop undefined so we don't overwrite fields not in the payload
  const updateData = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined))

  try {
    await sql`UPDATE leads SET ${sql(updateData)} WHERE id = ${leadId}`
  } catch (err: any) {
    return { error: err.message || 'Failed to update lead' }
  }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function updateLeadStage(leadId: string, stage: string) {
  const updates: Record<string, unknown> = { stage, updated_at: new Date().toISOString() }

  if (stage === 'proposal_sent') {
    const [existing] = await sql<{ proposal_sent_date: string | null }[]>`
      SELECT proposal_sent_date FROM leads WHERE id = ${leadId} LIMIT 1
    `
    if (!existing?.proposal_sent_date) {
      updates.proposal_sent_date = new Date().toISOString().split('T')[0]
    }
  }

  try {
    await sql`UPDATE leads SET ${sql(updates)} WHERE id = ${leadId}`
  } catch (err: any) {
    return { error: err.message || 'Failed to update lead stage' }
  }
  revalidateLeadDetail(leadId)
  revalidateLeadPaths()
  return { error: null }
}

export async function archiveLead(leadId: string) {
  try {
    await sql`UPDATE leads SET status = 'archived', updated_at = ${new Date().toISOString()} WHERE id = ${leadId}`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadPaths()
  return { error: null }
}

export async function unarchiveLead(leadId: string) {
  try {
    await sql`UPDATE leads SET status = 'active', updated_at = ${new Date().toISOString()} WHERE id = ${leadId}`
  } catch (err: any) { return { error: err.message } }
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

  try {
    await sql`
      INSERT INTO lead_notes (lead_id, author_id, content, note_type)
      VALUES (${leadId}, ${session.user.id}, ${payload.content}, ${payload.noteType})
    `
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function deleteLeadNote(leadId: string, noteId: string) {
  try {
    await sql`DELETE FROM lead_notes WHERE id = ${noteId}`
  } catch (err: any) { return { error: err.message } }
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

  try {
    await sql`
      INSERT INTO lead_tasks (lead_id, created_by, assigned_to, title, due_date, updated_at)
      VALUES (${leadId}, ${session.user.id}, ${payload.assignedTo ?? null}, ${payload.title}, ${payload.dueDate ?? null}, ${new Date().toISOString()})
    `
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function completeLeadTask(leadId: string, taskId: string) {
  const now = new Date().toISOString()
  try {
    await sql`UPDATE lead_tasks SET completed_at = ${now}, updated_at = ${now} WHERE id = ${taskId}`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function uncompleteLeadTask(leadId: string, taskId: string) {
  try {
    await sql`UPDATE lead_tasks SET completed_at = null, updated_at = ${new Date().toISOString()} WHERE id = ${taskId}`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function deleteLeadTask(leadId: string, taskId: string) {
  try {
    await sql`DELETE FROM lead_tasks WHERE id = ${taskId}`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

// ——— Conversion ——————————————————————————————————————————————

export async function convertLeadToAgency(leadId: string, agencyNameOverride?: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const [lead] = await sql<{
    id: string
    lead_type: string
    stage: string
    converted_agency_id: string | null
    converted_at: string | null
    company_name: string | null
    contact_first_name: string | null
    contact_last_name: string | null
    contact_phone: string | null
    contact_email: string | null
  }[]>`
    SELECT id, lead_type, stage, converted_agency_id, converted_at, company_name,
           contact_first_name, contact_last_name, contact_phone, contact_email
    FROM leads WHERE id = ${leadId} LIMIT 1
  `
  if (!lead) return { error: 'Lead not found' }
  if (lead.lead_type !== 'agency') return { error: 'Not an agency lead' }
  if (lead.converted_agency_id && lead.converted_at) return { error: 'Already converted' }
  if (lead.stage !== 'signed') return { error: 'Lead must be at the Signed stage before converting to an agency' }

  const agencyName = agencyNameOverride?.trim() || lead.company_name?.trim()
  if (!agencyName) return { error: 'NEEDS_AGENCY_NAME' }

  const now = new Date().toISOString()
  let agencyId: string
  try {
    const [agency] = await sql<{ id: string }[]>`
      INSERT INTO agencies (name, onboarding_status, status, state_specific_data,
        primary_contact_first_name, primary_contact_last_name, phone_number, email, updated_at)
      VALUES (
        ${agencyName}, 'shell', 'active', '{}',
        ${lead.contact_first_name || null}, ${lead.contact_last_name || null},
        ${lead.contact_phone || null}, ${lead.contact_email || null}, ${now}
      )
      RETURNING id
    `
    if (!agency) return { error: 'Failed to create agency' }
    agencyId = agency.id
  } catch (err: any) {
    return { error: err.message ?? 'Failed to create agency' }
  }

  await q.seedDefaultAgencyLeadStages(agencyId)

  try {
    await sql`
      UPDATE leads SET
        converted_agency_id = ${agencyId},
        converted_at = ${now},
        stage = 'signed',
        updated_at = ${now}
      WHERE id = ${leadId}
    `
  } catch (err: any) {
    return { error: err.message }
  }

  revalidateLeadDetail(leadId)
  revalidatePath('/pages/admin/agencies')
  return { error: null, agencyId }
}

export async function linkLeadToExistingAgency(leadId: string, agencyId: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }
  const { error } = await q.linkLeadToExistingAgency(leadId, agencyId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function unlinkLeadFromAgency(leadId: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }
  const { error } = await q.unlinkLeadFromAgency(leadId)
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

  const ext = file.name.split('.').pop()
  const filePath = `${leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadErr } = await uploadFile(STORAGE_BUCKET.LEAD, filePath, file)
  if (uploadErr) return { error: uploadErr.message }

  const { data, error: insertErr } = await q.insertLeadDocument({
    lead_id: leadId,
    document_name: documentName.trim(),
    file_url: filePath,
    file_name: file.name,
    document_type: documentType ?? null,
    uploaded_by: session.user.id,
  })

  if (insertErr) {
    const { error: cleanupErr } = await removeFiles(STORAGE_BUCKET.LEAD, [filePath])
    if (cleanupErr) console.error('[leads/uploadLeadDocument] Storage cleanup failed. path=%s err=%s', filePath, cleanupErr.message)
    return { error: insertErr.message }
  }

  revalidateLeadDetail(leadId)
  return { error: null, doc: { id: data!.id, document_name: documentName.trim(), file_url: filePath } }
}

export async function deleteLeadDocumentAction(leadId: string, docId: string, filePath: string) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }
  const { error: storageErr } = await removeFiles(STORAGE_BUCKET.LEAD, [filePath])
  if (storageErr) console.error('[leads/deleteLeadDocument] Storage delete failed. path=%s err=%s', filePath, storageErr.message)
  const { error } = await q.deleteLeadDocument(docId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

// ——— On-demand reads (called from client components) ——————————————————————

export async function fetchLeadDocumentsAction(leadId: string) {
  const { data, error } = await q.getLeadDocuments(leadId)
  if (error) return { error: error.message, data: null }
  return { error: null, data: data ?? [] }
}

export async function fetchLeadNotesAction(leadId: string) {
  const { data, error } = await q.getLeadNotes(leadId)
  if (error) return { error: error.message, data: null }
  return { error: null, data: data ?? [] }
}

export async function updatePatientLeadDetailsAction(
  leadId: string,
  data: {
    pocName?: string | null
    pocPhone?: string | null
    pocRelationship?: string | null
    pocEmail?: string | null
    reasonForCare?: string | null
    mobilityStatus?: string | null
    cognitiveStatus?: string | null
    medicalConditions?: string | null
    gender?: string | null
    dateOfBirth?: string | null
    startDate?: string | null
    scheduleType?: string | null
    livingSituation?: string | null
    paymentMethod?: string | null
    insuranceCarrier?: string | null
    insurancePolicyNumber?: string | null
  }
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
  const { error: authErr, session } = await requireAgencyMember()
  if (authErr || !session) return { success: false, error: authErr ?? 'Forbidden' }

  const agencyId = session.profile?.agency_id

  const [lead] = await sql<{ id: string; lead_type: string; agency_id: string | null }[]>`
    SELECT id, lead_type, agency_id FROM leads WHERE id = ${leadId} LIMIT 1
  `
  if (!lead) return { success: false, error: 'Lead not found' }
  if (lead.lead_type !== 'patient') return { success: false, error: 'Not a patient lead' }
  if (lead.agency_id !== agencyId) return { success: false, error: 'Forbidden' }

  const { data: upserted, error } = await q.upsertPatientLeadDetails(leadId, {
    poc_name: data.pocName ?? null,
    poc_phone: data.pocPhone ?? null,
    poc_relationship: data.pocRelationship ?? null,
    poc_email: data.pocEmail ?? null,
    reason_for_care: data.reasonForCare ?? null,
    mobility_status: data.mobilityStatus ?? null,
    cognitive_status: data.cognitiveStatus ?? null,
    medical_conditions: data.medicalConditions ?? null,
    gender: data.gender ?? null,
    date_of_birth: data.dateOfBirth ?? null,
    start_date: data.startDate ?? null,
    schedule_type: data.scheduleType ?? null,
    living_situation: data.livingSituation ?? null,
    payment_method: data.paymentMethod ?? null,
    insurance_carrier: data.insuranceCarrier ?? null,
    insurance_policy_number: data.insurancePolicyNumber ?? null,
  })
  if (error) return { success: false, error: error.message }

  const { error: auditErr } = await q.insertAuditLog({
    table_name: 'patient_lead_details',
    record_id: upserted?.id ?? leadId,
    action: 'UPSERT',
    performed_by_user_id: session.user.id,
    details: { lead_id: leadId, agency_id: agencyId },
  })
  if (auditErr) console.error('[leads/updatePatientLeadDetails] Audit log failed. leadId=%s err=%s', leadId, auditErr.message)

  revalidateLeadDetail(leadId)
  return { success: true }
}

export async function createRepresentativeFromLeadAction(leadId: string, patientId: string) {
  const { error: authErr, session } = await requireAgencyMember()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const { data: details } = await q.getPatientLeadDetails(leadId)
  if (!details?.poc_name?.trim()) return { error: null }

  const { error } = await q.insertRepresentative({
    patient_id: patientId,
    name: details.poc_name,
    relationship: details.poc_relationship ?? null,
    phone_number: details.poc_phone ?? null,
    email_address: details.poc_email ?? null,
    display_order: 0,
  })
  if (error) return { error: error.message }
  return { error: null }
}

export async function linkLeadToPatient(leadId: string, patientId: string) {
  const { error: authErr, session } = await requireAgencyMember()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const agencyId = session.profile?.agency_id
  if (!agencyId) return { error: 'No agency found for this user' }

  const [lead] = await sql<{ id: string; lead_type: string; agency_id: string | null; stage: string }[]>`
    SELECT id, lead_type, agency_id, stage FROM leads WHERE id = ${leadId} LIMIT 1
  `
  if (!lead) return { error: 'Lead not found' }
  if (lead.lead_type !== 'patient') return { error: 'Not a patient lead' }
  if (lead.agency_id !== agencyId) return { error: 'Forbidden' }

  const [wonStage] = await sql<{ key: string }[]>`
    SELECT key FROM agency_lead_stages WHERE agency_id = ${agencyId} AND is_won = true LIMIT 1
  `
  if (wonStage && lead.stage !== wonStage.key) {
    return { error: `Lead must be at the "${wonStage.key}" stage before converting to a client` }
  }

  const now = new Date().toISOString()
  try {
    await sql`
      UPDATE leads SET converted_client_id = ${patientId}, converted_at = ${now}, updated_at = ${now}
      WHERE id = ${leadId}
    `
  } catch (err: any) {
    return { error: err.message }
  }
  revalidateLeadDetail(leadId)
  return { error: null }
}
