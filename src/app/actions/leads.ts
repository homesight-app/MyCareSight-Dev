'use server'

import { revalidatePath } from 'next/cache'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { STORAGE_BUCKET } from '@/lib/storage'
import { removeFiles } from '@/lib/storage/client'
import { readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import { commitLeadDocumentSchema } from '@/lib/schemas/lead-documents'
import {
  deleteLeadDocument,
  getManageableLead,
  getManageableLeadDocument,
  insertLeadDocument,
} from '@/lib/repositories/lead-documents'
import { leadConversionSchema, patientLeadDetailsSchema } from '@/lib/schemas/patient-lead'
import { zodErrorToFieldErrors } from '@/lib/validation'

type LeadCollaborator = {
  id: string
  full_name: string | null
  role: 'admin' | 'expert' | 'company_owner' | 'care_coordinator'
}

type LeadActorScope = {
  id: string
  role: LeadCollaborator['role']
  agencyId: string | null
}

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

async function getCurrentLeadActorScope(): Promise<LeadActorScope | null> {
  const session = await getSession()
  if (!session) return null

  const [actor] = await sql<{ id: string; role: LeadActorScope['role']; agency_id: string | null }[]>`
    SELECT profile.id, profile.role, profile.agency_id
    FROM public.user_profiles profile
    WHERE profile.id = ${session.user.id}::uuid
      AND profile.is_active = true
      AND profile.role IN ('admin', 'expert', 'company_owner', 'care_coordinator')
      AND (
        profile.role IN ('admin', 'expert')
        OR EXISTS (
          SELECT 1
          FROM public.user_agency_roles membership
          WHERE membership.user_id = profile.id
            AND membership.agency_id = profile.agency_id
            AND membership.role = profile.role
            AND membership.status = 'active'
        )
      )
    LIMIT 1
  `
  if (!actor) return null
  return { id: actor.id, role: actor.role, agencyId: actor.agency_id }
}

async function getEligibleLeadCollaborators(scope: LeadActorScope): Promise<LeadCollaborator[]> {
  if (scope.role === 'admin' || scope.role === 'expert') {
    return sql<LeadCollaborator[]>`
      SELECT id, full_name, role
      FROM public.user_profiles
      WHERE is_active = true AND role IN ('admin', 'expert')
      ORDER BY full_name NULLS LAST, id
    `
  }
  if (!scope.agencyId) return []
  return sql<LeadCollaborator[]>`
    SELECT DISTINCT profile.id, profile.full_name, profile.role
    FROM public.user_profiles profile
    JOIN public.user_agency_roles membership
      ON membership.user_id = profile.id
     AND membership.agency_id = profile.agency_id
     AND membership.role = profile.role
     AND membership.status = 'active'
    WHERE profile.is_active = true
      AND profile.agency_id = ${scope.agencyId}::uuid
      AND profile.role IN ('company_owner', 'care_coordinator')
    ORDER BY profile.full_name NULLS LAST, profile.id
  `
}

async function isEligibleLeadCollaborator(
  userId: string,
  leadType: 'agency' | 'patient',
  agencyId: string | null,
) {
  const [eligible] = await sql<{ allowed: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM public.user_profiles profile
      WHERE profile.id = ${userId}::uuid
        AND profile.is_active = true
        AND (
          (
            ${leadType} = 'agency'
            AND profile.role IN ('admin', 'expert')
          )
          OR (
            ${leadType} = 'patient'
            AND ${agencyId}::uuid IS NOT NULL
            AND profile.agency_id = ${agencyId}::uuid
            AND profile.role IN ('company_owner', 'care_coordinator')
            AND EXISTS (
              SELECT 1
              FROM public.user_agency_roles membership
              WHERE membership.user_id = profile.id
                AND membership.agency_id = ${agencyId}::uuid
                AND membership.role = profile.role
                AND membership.status = 'active'
            )
          )
        )
    ) AS allowed
  `
  return eligible?.allowed === true
}

function leadIsConverted(lead: {
  converted_agency_id: string | null
  converted_client_id: string | null
  converted_at: string | null
}) {
  return Boolean(lead.converted_at && (lead.converted_agency_id || lead.converted_client_id))
}

async function requireMutableLead(leadId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null, lead: null }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  const lead = await withUserContext(session.user.id, role, agencyId, () =>
    getManageableLead(leadId, session.user.id)
  )
  if (!lead) return { error: 'Lead not found or not authorized', session: null, lead: null }
  if (leadIsConverted(lead)) {
    return { error: 'Converted leads are read-only', session: null, lead: null }
  }
  return { error: null, session, lead }
}

export async function getLeadCollaboratorOptionsAction() {
  const scope = await getCurrentLeadActorScope()
  if (!scope) return { data: [], currentUserId: null, error: 'Forbidden' }
  const data = await getEligibleLeadCollaborators(scope)
  return { data, currentUserId: scope.id, error: null }
}

export async function getAdminLeadOwnerOptionsAction() {
  return getLeadCollaboratorOptionsAction()
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
  const actor = await getCurrentLeadActorScope()
  if (!actor) return { error: 'Forbidden' }
  if (payload.leadType === 'agency' && actor.role !== 'admin' && actor.role !== 'expert') {
    return { error: 'Forbidden' }
  }
  if (payload.leadType === 'patient' && actor.role !== 'company_owner' && actor.role !== 'care_coordinator') {
    return { error: 'Forbidden' }
  }
  const agencyId = payload.leadType === 'patient' ? actor.agencyId : null
  if (payload.leadType === 'patient' && !agencyId) return { error: 'An active agency membership is required' }

  const ownerId = payload.leadOwnerId === undefined
    ? actor.id
    : (payload.leadOwnerId?.trim() || null)
  if (ownerId && !(await isEligibleLeadCollaborator(ownerId, payload.leadType, agencyId))) {
    return { error: 'Select an active eligible lead owner' }
  }

  try {
    const data = await sql.begin(async tx => {
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO leads (
          lead_type, agency_id, created_by, assigned_to,
          contact_first_name, contact_last_name, contact_email, contact_phone,
          company_name, service_type, stage, price,
          retainer_amount, retainer_paid_date, installments, installment_amount,
          signed_date, notes, source, converted_agency_id, lead_owner_id,
          service_states, status, updated_at
        ) VALUES (
          ${payload.leadType}, ${agencyId}, ${actor.id}, ${payload.assignedTo ?? null},
          ${payload.contactFirstName}, ${payload.contactLastName}, ${payload.contactEmail ?? null}, ${payload.contactPhone ?? null},
          ${payload.companyName ?? null}, ${payload.serviceType ?? null}, ${payload.stage ?? 'new'}, ${payload.price ?? null},
          ${payload.retainerAmount ?? null}, ${payload.retainerPaidDate ?? null}, ${payload.installments ?? null}, ${payload.installmentAmount ?? null},
          ${payload.signedDate ?? null}, ${payload.notes ?? null}, ${payload.source ?? null}, ${payload.convertedAgencyId ?? null}, ${ownerId},
          ${payload.serviceStates ?? null}, 'active', ${new Date().toISOString()}
        )
        RETURNING id
      `
      if (!created) throw new Error('Insert failed')
      await tx`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${agencyId}::uuid, 'leads', ${created.id}::uuid, 'ASSIGN_OWNER', ${actor.id}::uuid,
          ${tx.json({ owner_user_id: ownerId, operation: 'lead_created' })}::jsonb
        )
      `
      return created
    })
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
  const access = await requireMutableLead(leadId)
  if (access.error || !access.session || !access.lead) return { error: access.error ?? 'Not authenticated' }
  const ownerChanged = 'leadOwnerId' in payload && payload.leadOwnerId !== access.lead.lead_owner_id
  if ('leadOwnerId' in payload) {
    if (payload.leadOwnerId && !(await isEligibleLeadCollaborator(payload.leadOwnerId, access.lead.lead_type, access.lead.agency_id))) {
      return { error: 'Select an active eligible lead owner' }
    }
  }
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
    await sql.begin(async tx => {
      const updated = await tx<{ id: string }[]>`
        UPDATE leads SET ${tx(updateData)}
        WHERE id = ${leadId} AND converted_at IS NULL
        RETURNING id
      `
      if (!updated[0]) throw new Error('Converted leads are read-only')
      if (ownerChanged) {
        await tx`
          INSERT INTO public.audit_log (
            agency_id, table_name, record_id, action, performed_by_user_id, details
          ) VALUES (
            ${access.lead.agency_id}::uuid, 'leads', ${leadId}::uuid, 'ASSIGN_OWNER',
            ${access.session.user.id}::uuid,
            ${tx.json({ previous_owner_user_id: access.lead.lead_owner_id, owner_user_id: payload.leadOwnerId })}::jsonb
          )
        `
      }
    })
  } catch (err: any) {
    return { error: err.message || 'Failed to update lead' }
  }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function updateLeadStage(leadId: string, stage: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
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
    const updated = await sql<{ id: string }[]>`
      UPDATE leads SET ${sql(updates)}
      WHERE id = ${leadId} AND converted_at IS NULL
      RETURNING id
    `
    if (!updated[0]) return { error: 'Converted leads are read-only' }
  } catch (err: any) {
    return { error: err.message || 'Failed to update lead stage' }
  }
  revalidateLeadDetail(leadId)
  revalidateLeadPaths()
  return { error: null }
}

export async function archiveLead(leadId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  try {
    await sql`UPDATE leads SET status = 'archived', updated_at = ${new Date().toISOString()} WHERE id = ${leadId} AND converted_at IS NULL`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadPaths()
  return { error: null }
}

export async function unarchiveLead(leadId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  try {
    await sql`UPDATE leads SET status = 'active', updated_at = ${new Date().toISOString()} WHERE id = ${leadId} AND converted_at IS NULL`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadPaths()
  return { error: null }
}

// ——— Notes ——————————————————————————————————————————————————

export async function addLeadNote(
  leadId: string,
  payload: { content: string; noteType: string }
) {
  const access = await requireMutableLead(leadId)
  if (access.error || !access.session) return { error: access.error ?? 'Not authenticated' }

  try {
    await sql`
      INSERT INTO lead_notes (lead_id, author_id, content, note_type)
      VALUES (${leadId}, ${access.session.user.id}, ${payload.content}, ${payload.noteType})
    `
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function deleteLeadNote(leadId: string, noteId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  try {
    await sql`DELETE FROM lead_notes WHERE id = ${noteId} AND lead_id = ${leadId}`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

// ——— Tasks ——————————————————————————————————————————————————

export async function addLeadTask(
  leadId: string,
  payload: { title: string; dueDate?: string | null; assignedTo?: string | null }
) {
  const access = await requireMutableLead(leadId)
  if (access.error || !access.session || !access.lead) return { error: access.error ?? 'Not authenticated' }

  const assignedTo = payload.assignedTo === undefined
    ? access.session.user.id
    : (payload.assignedTo || null)
  if (assignedTo && !(await isEligibleLeadCollaborator(assignedTo, access.lead.lead_type, access.lead.agency_id))) {
    return { error: 'Select an active eligible task assignee' }
  }

  try {
    await sql.begin(async tx => {
      const [task] = await tx<{ id: string }[]>`
        INSERT INTO lead_tasks (lead_id, created_by, assigned_to, title, due_date, updated_at)
        VALUES (${leadId}, ${access.session.user.id}, ${assignedTo}, ${payload.title}, ${payload.dueDate ?? null}, ${new Date().toISOString()})
        RETURNING id
      `
      if (!task) throw new Error('Failed to create task')
      await tx`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${access.lead.agency_id}::uuid, 'lead_tasks', ${task.id}::uuid, 'CREATE',
          ${access.session.user.id}::uuid,
          ${tx.json({ lead_id: leadId, assigned_to_user_id: assignedTo })}::jsonb
        )
      `
    })
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function updateLeadTaskAssignee(
  leadId: string,
  taskId: string,
  assignedTo: string | null,
) {
  const access = await requireMutableLead(leadId)
  if (access.error || !access.session || !access.lead) return { error: access.error ?? 'Not authenticated' }
  if (assignedTo && !(await isEligibleLeadCollaborator(assignedTo, access.lead.lead_type, access.lead.agency_id))) {
    return { error: 'Select an active eligible task assignee' }
  }

  try {
    await sql.begin(async tx => {
      const [task] = await tx<{ assigned_to: string | null }[]>`
        SELECT assigned_to
        FROM public.lead_tasks
        WHERE id = ${taskId}::uuid AND lead_id = ${leadId}::uuid
        FOR UPDATE
      `
      if (!task) throw new Error('Task not found')
      if (task.assigned_to === assignedTo) return
      await tx`
        UPDATE public.lead_tasks
        SET assigned_to = ${assignedTo}::uuid, updated_at = ${new Date().toISOString()}
        WHERE id = ${taskId}::uuid AND lead_id = ${leadId}::uuid
      `
      await tx`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${access.lead.agency_id}::uuid, 'lead_tasks', ${taskId}::uuid, 'ASSIGN',
          ${access.session.user.id}::uuid,
          ${tx.json({ lead_id: leadId, previous_assigned_to_user_id: task.assigned_to, assigned_to_user_id: assignedTo })}::jsonb
        )
      `
    })
  } catch (err: any) { return { error: err.message || 'Failed to assign task' } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function completeLeadTask(leadId: string, taskId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  const now = new Date().toISOString()
  try {
    await sql`UPDATE lead_tasks SET completed_at = ${now}, updated_at = ${now} WHERE id = ${taskId} AND lead_id = ${leadId}`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function uncompleteLeadTask(leadId: string, taskId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  try {
    await sql`UPDATE lead_tasks SET completed_at = null, updated_at = ${new Date().toISOString()} WHERE id = ${taskId} AND lead_id = ${leadId}`
  } catch (err: any) { return { error: err.message } }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function deleteLeadTask(leadId: string, taskId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  try {
    await sql`DELETE FROM lead_tasks WHERE id = ${taskId} AND lead_id = ${leadId}`
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
        status = 'archived',
        updated_at = ${now}
      WHERE id = ${leadId}
    `
  } catch (err: any) {
    return { error: err.message }
  }

  revalidateLeadDetail(leadId)
  revalidateLeadPaths()
  revalidatePath('/pages/admin/agencies')
  return { error: null, agencyId }
}

export async function linkLeadToExistingAgency(leadId: string, agencyId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  if (access.session?.profile?.role !== 'admin' && access.session?.profile?.role !== 'expert') return { error: 'Forbidden' }
  const { error } = await q.linkLeadToExistingAgency(leadId, agencyId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function unlinkLeadFromAgency(leadId: string) {
  const access = await requireMutableLead(leadId)
  if (access.error) return { error: access.error }
  if (access.session?.profile?.role !== 'admin' && access.session?.profile?.role !== 'expert') return { error: 'Forbidden' }
  const { error } = await q.unlinkLeadFromAgency(leadId)
  if (error) return { error: error.message }
  revalidateLeadDetail(leadId)
  return { error: null }
}

export async function commitLeadDocumentUploadAction(input: unknown) {
  const parsed = commitLeadDocumentSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid document upload', doc: null }

  const session = await getSession()
  if (!session) return { error: 'Not authenticated', doc: null }
  const { leadId, upload, name, originalFileName, documentType } = parsed.data
  const claim = readStorageCleanupToken(upload.cleanupToken)
  if (
    !claim || claim.actorId !== session.user.id
    || claim.bucket !== STORAGE_BUCKET.LEAD
    || claim.tableName !== 'leads'
    || claim.recordId !== leadId
    || claim.path !== upload.path
    || !claim.path.startsWith(`${leadId}/`)
  ) return { error: 'Invalid document upload', doc: null }

  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  const result = await withUserContext(session.user.id, role, agencyId, async () => {
    const lead = await getManageableLead(leadId, session.user.id)
    if (!lead || lead.agency_id !== claim.agencyId) return null
    if (leadIsConverted(lead)) return null
    const document = await insertLeadDocument({
      leadId,
      name,
      path: upload.path,
      originalFileName,
      documentType,
      uploadedBy: session.user.id,
    })
    if (!document) throw new Error('Lead document insert failed')
    const { error: auditError } = await q.insertAuditLog({
      agency_id: lead.agency_id,
      table_name: 'lead_documents',
      record_id: document.id,
      action: 'CREATE',
      performed_by_user_id: session.user.id,
      details: { lead_id: leadId, operation: 'upload' },
    })
    if (auditError) throw new Error('Lead document audit failed')
    return { document, patientId: lead.converted_client_id }
  }).catch(() => null)

  if (!result) return { error: 'Could not save document metadata', doc: null }
  revalidateLeadDetail(leadId)
  if (result.patientId) revalidatePath(`/pages/agency/clients/${result.patientId}`)
  return { error: null, doc: result.document }
}

export async function deleteLeadDocumentAction(leadId: string, docId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null

  const deleted = await withUserContext(session.user.id, role, agencyId, async () => {
    const managed = await getManageableLeadDocument(leadId, docId, session.user.id)
    if (!managed) return null
    if (leadIsConverted(managed.lead)) return null
    const removed = await deleteLeadDocument(docId)
    if (!removed) return null
    const { error: auditError } = await q.insertAuditLog({
      agency_id: managed.lead.agency_id,
      table_name: 'lead_documents',
      record_id: docId,
      action: 'DELETE',
      performed_by_user_id: session.user.id,
      details: { lead_id: leadId, operation: 'delete' },
    })
    if (auditError) throw new Error('Lead document audit failed')
    return {
      path: managed.document.file_url,
      patientId: managed.lead.converted_client_id,
    }
  }).catch(() => null)
  if (!deleted) return { error: 'Document not found or not authorized' }

  const { error: storageError } = await removeFiles(STORAGE_BUCKET.LEAD, [deleted.path])
  if (storageError) console.error('[leads/deleteLeadDocument] Orphaned Blob cleanup required')
  revalidateLeadDetail(leadId)
  if (deleted.patientId) revalidatePath(`/pages/agency/clients/${deleted.patientId}`)
  return { error: null }
}

// ——— On-demand reads (called from client components) ——————————————————————

export async function fetchLeadDocumentsAction(leadId: string) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  const authorized = await withUserContext(session.user.id, role, agencyId, () =>
    getManageableLead(leadId, session.user.id)
  )
  if (!authorized) return { error: 'Not found or not authorized', data: null }
  const { data, error } = await withUserContext(session.user.id, role, agencyId, () => q.getLeadDocuments(leadId))
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
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
  const { error: authErr, session } = await requireAgencyMember()
  if (authErr || !session) return { success: false, error: authErr ?? 'Forbidden' }

  const parsed = patientLeadDetailsSchema.safeParse(data)
  if (!parsed.success) return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  const agencyId = session.profile?.agency_id ?? null
  if (!agencyId) return { success: false, error: 'No agency found for this user' }

  try {
    await withUserContext(session.user.id, session.profile?.role ?? '', agencyId, async () => {
      const [lead] = await sql<{
        id: string
        converted_agency_id: string | null
        converted_client_id: string | null
        converted_at: string | null
      }[]>`
        SELECT id, converted_agency_id, converted_client_id, converted_at
        FROM public.leads
        WHERE id = ${leadId}::uuid AND agency_id = ${agencyId}::uuid AND lead_type = 'patient'
        LIMIT 1
      `
      if (!lead) throw new Error('LEAD_NOT_FOUND')
      if (leadIsConverted(lead)) throw new Error('LEAD_CONVERTED')
      const [upserted] = await sql<{ id: string }[]>`
        INSERT INTO public.patient_lead_details (
          lead_id, poc_name, poc_phone, poc_relationship, poc_email, start_date, updated_at
        ) VALUES (
          ${leadId}::uuid, ${parsed.data.pocName || null}, ${parsed.data.pocPhone || null},
          ${parsed.data.pocRelationship || null}, ${parsed.data.pocEmail || null},
          ${parsed.data.startDate || null}::date, clock_timestamp()
        )
        ON CONFLICT (lead_id) DO UPDATE SET
          poc_name = EXCLUDED.poc_name, poc_phone = EXCLUDED.poc_phone,
          poc_relationship = EXCLUDED.poc_relationship, poc_email = EXCLUDED.poc_email,
          start_date = EXCLUDED.start_date, updated_at = clock_timestamp()
        RETURNING id
      `
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (${agencyId}::uuid, 'patient_lead_details', ${upserted.id}::uuid, 'UPSERT',
          ${session.user.id}::uuid, ${sql.json({ lead_id: leadId, fields: ['contact', 'desired_start_date'] })}::jsonb)
      `
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'LEAD_NOT_FOUND') return { success: false, error: 'Lead not found or not authorized' }
    if (error instanceof Error && error.message === 'LEAD_CONVERTED') return { success: false, error: 'Converted leads are read-only' }
    return { success: false, error: 'Unable to save lead contact details' }
  }

  revalidateLeadDetail(leadId)
  return { success: true }
}

export async function convertPatientLeadToClientAction(input: unknown): Promise<{
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  requiresDuplicateConfirmation?: boolean
  patient?: Record<string, unknown>
}> {
  const { error: authErr, session } = await requireAgencyMember()
  if (authErr || !session) return { success: false, error: authErr ?? 'Forbidden' }
  const parsed = leadConversionSchema.safeParse(input)
  if (!parsed.success) return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  const agencyId = session.profile?.agency_id ?? null
  if (!agencyId) return { success: false, error: 'No agency found for this user' }

  try {
    const outcome = await withUserContext(session.user.id, session.profile?.role ?? '', agencyId, async () => {
      const [lead] = await sql<{ id: string; stage: string; converted_client_id: string | null }[]>`
        SELECT id, stage, converted_client_id
        FROM public.leads
        WHERE id = ${parsed.data.leadId}::uuid AND agency_id = ${agencyId}::uuid AND lead_type = 'patient'
        FOR UPDATE
        LIMIT 1
      `
      if (!lead) return { success: false, error: 'Lead not found or not authorized' }
      if (lead.converted_client_id) {
        const [existing] = await sql<Record<string, unknown>[]>`
          SELECT p.*, COALESCE((SELECT json_agg(r ORDER BY r.display_order) FROM public.patients_representatives r WHERE r.patient_id = p.id), '[]') AS patients_representatives
          FROM public.patients p WHERE p.id = ${lead.converted_client_id}::uuid AND p.agency_id = ${agencyId}::uuid
        `
        return existing ? { success: true, patient: existing } : { success: false, error: 'Converted client record was not found' }
      }
      const [wonStage] = await sql<{ key: string }[]>`
        SELECT key FROM public.agency_lead_stages
        WHERE agency_id = ${agencyId}::uuid AND is_won = true
        LIMIT 1
      `
      if (wonStage && lead.stage !== wonStage.key) {
        return { success: false, error: 'Move the lead to the won stage before converting it to a client' }
      }
      const email = parsed.data.email?.trim() || null
      const phone = parsed.data.phone?.trim() || null
      const [duplicate] = await sql<{ id: string }[]>`
        SELECT id FROM public.patients
        WHERE agency_id = ${agencyId}::uuid
          AND (
            (${email}::text IS NOT NULL AND lower(email_address) = lower(${email}))
            OR (${phone}::text IS NOT NULL AND regexp_replace(phone_number, '\\D', '', 'g') = regexp_replace(${phone}, '\\D', '', 'g'))
          )
        LIMIT 1
      `
      if (duplicate && !parsed.data.confirmPossibleDuplicate) {
        return { success: false, requiresDuplicateConfirmation: true, error: 'A client with the same email or phone may already exist.' }
      }
      const [details] = await sql<{ poc_name: string | null; poc_phone: string | null; poc_relationship: string | null; poc_email: string | null }[]>`
        SELECT poc_name, poc_phone, poc_relationship, poc_email
        FROM public.patient_lead_details WHERE lead_id = ${parsed.data.leadId}::uuid LIMIT 1
      `
      const [patient] = await sql<Array<{ id: string } & Record<string, unknown>>>`
        INSERT INTO public.patients (
          agency_id, first_name, last_name, phone_number, email_address,
          street_address, city, state, zip_code, emergency_contact_name,
          emergency_phone, status
        ) VALUES (
          ${agencyId}::uuid, ${parsed.data.firstName}, ${parsed.data.lastName}, ${phone ?? ''}, ${email ?? ''},
          ${parsed.data.streetAddress ?? ''}, ${parsed.data.city ?? ''}, ${parsed.data.state ?? ''}, ${parsed.data.zipCode ?? ''},
          '', '', 'pending'
        ) RETURNING *
      `
      if (details?.poc_name?.trim()) {
        await sql`
          INSERT INTO public.patients_representatives (patient_id, name, relationship, phone_number, email_address, display_order)
          VALUES (${patient.id}::uuid, ${details.poc_name}, ${details.poc_relationship}, ${details.poc_phone}, ${details.poc_email}, 0)
        `
      }
      if (parsed.data.streetAddress) {
        await sql`
          INSERT INTO public.patient_addresses (patient_id, agency_id, label, street_address, city, state, zip_code, is_primary)
          VALUES (${patient.id}::uuid, ${agencyId}::uuid, 'Home', ${parsed.data.streetAddress}, ${parsed.data.city ?? ''},
            ${parsed.data.state ?? ''}, ${parsed.data.zipCode ?? ''}, true)
        `
      }
      const [documentCount] = await sql<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM public.lead_documents
        WHERE lead_id = ${parsed.data.leadId}::uuid
      `
      await sql`
        UPDATE public.leads
        SET converted_client_id = ${patient.id}::uuid,
            converted_at = clock_timestamp(),
            status = 'archived',
            updated_at = clock_timestamp()
        WHERE id = ${parsed.data.leadId}::uuid AND agency_id = ${agencyId}::uuid
      `
      await sql`
        INSERT INTO public.audit_log (
          agency_id, patient_id, table_name, record_id, action,
          performed_by_user_id, details
        ) VALUES (
          ${agencyId}::uuid, ${patient.id}::uuid, 'leads', ${parsed.data.leadId}::uuid,
          'CONVERT_TO_CLIENT', ${session.user.id}::uuid,
          ${sql.json({ document_count: documentCount?.count ?? 0, client_status: 'pending', duplicate_override: Boolean(duplicate) })}::jsonb
        )
      `
      const representatives = details?.poc_name?.trim()
        ? [{ name: details.poc_name, relationship: details.poc_relationship, phone_number: details.poc_phone, email_address: details.poc_email, display_order: 0 }]
        : []
      return { success: true, patient: { ...patient, patients_representatives: representatives } }
    })
    if (!outcome.success) return outcome
    revalidateLeadDetail(parsed.data.leadId)
    revalidateLeadPaths()
    revalidatePath('/pages/agency/clients')
    return outcome
  } catch {
    return { success: false, error: 'Unable to convert this lead. No client was created.' }
  }
}
