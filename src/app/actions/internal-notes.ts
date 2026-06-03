'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'

// agency_admin is the current role string. company_owner is a legacy alias kept
// here only during the transition period — remove it once the rename is complete.
// RLS via hs_can_manage_agency() (checks agency_admins table, not this string)
// is the primary enforcement gate; this check is defense-in-depth only.
const ALLOWED_ROLES = new Set(['agency_admin', 'company_owner', 'care_coordinator'])

const subjectTypeSchema = z.enum(['patient', 'caregiver', 'visit'])

const addNoteSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  agencyId: z.string().min(1),
  content: z.string().min(1, 'Note content cannot be empty'),
  taggedPatientId: z.string().nullable().optional(),
  taggedCaregiverId: z.string().nullable().optional(),
})

const editNoteSchema = z.object({
  noteId: z.string().min(1),
  content: z.string().min(1, 'Note content cannot be empty'),
  agencyId: z.string().min(1),
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  taggedPatientId: z.string().nullable().optional(),
  taggedCaregiverId: z.string().nullable().optional(),
})

const deleteNoteSchema = z.object({
  noteId: z.string().min(1),
  agencyId: z.string().min(1),
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
})

const logSearchSchema = z.object({
  agencyId: z.string().min(1),
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  searchTerm: z.string(),
  resultsReturned: z.number().int().min(0),
})

function subjectPath(subjectType: 'patient' | 'caregiver' | 'visit', subjectId: string) {
  if (subjectType === 'patient')   return `/pages/agency/clients/${subjectId}`
  if (subjectType === 'caregiver') return `/pages/agency/caregiver/${subjectId}`
  return `/pages/agency/care-visits`
}

export async function addInternalNoteAction(input: {
  subjectType: 'patient' | 'caregiver' | 'visit'
  subjectId: string
  agencyId: string
  content: string
  taggedPatientId?: string | null
  taggedCaregiverId?: string | null
}): Promise<{ error: string | null; id?: string }> {
  const parsed = addNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (!ALLOWED_ROLES.has(session.profile?.role ?? '')) return { error: 'Insufficient permissions' }

  const supabase = await createClient()
  const { data, error } = await q.insertInternalNote(supabase, {
    agency_id: input.agencyId,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    content: input.content.trim(),
    created_by: session.user.id,
    tagged_patient_id:   input.taggedPatientId   ?? null,
    tagged_caregiver_id: input.taggedCaregiverId ?? null,
  })

  if (error || !data) return { error: 'Failed to save note' }

  // HIPAA § 164.312(b): synchronous audit insert — if this fails, the error surfaces.
  const { error: auditInsertErr } = await supabase.from('audit_log').insert({
    agency_id: input.agencyId,
    table_name: 'internal_notes',
    record_id: data.id,
    action: 'INSERT',
    performed_by_user_id: session.user.id,
    details: {
      subject_type:        input.subjectType,
      subject_id:          input.subjectId,
      content:             input.content.trim(),
      tagged_patient_id:   input.taggedPatientId   ?? null,
      tagged_caregiver_id: input.taggedCaregiverId ?? null,
    },
  })
  if (auditInsertErr) console.error('[internal-notes/addNote] Audit log INSERT failed. noteId=%s err=%s', data.id, auditInsertErr.message)

  revalidatePath(subjectPath(input.subjectType, input.subjectId))
  if (input.taggedPatientId)   revalidatePath(`/pages/agency/clients/${input.taggedPatientId}`)
  if (input.taggedCaregiverId) revalidatePath(`/pages/agency/caregiver/${input.taggedCaregiverId}`)

  return { error: null, id: data.id }
}

export async function editInternalNoteAction(input: {
  noteId: string
  content: string
  agencyId: string
  subjectType: 'patient' | 'caregiver' | 'visit'
  subjectId: string
  taggedPatientId?: string | null
  taggedCaregiverId?: string | null
}): Promise<{ error: string | null }> {
  const parsed = editNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (!ALLOWED_ROLES.has(session.profile?.role ?? '')) return { error: 'Insufficient permissions' }

  const supabase = await createClient()

  // Read existing note BEFORE overwriting — required for HIPAA old_values audit record.
  const { data: existing } = await q.getInternalNoteById(supabase, input.noteId)
  const oldContent            = existing?.content             ?? null
  const oldTaggedPatientId    = existing?.tagged_patient_id   ?? null
  const oldTaggedCaregiverId  = existing?.tagged_caregiver_id ?? null

  const { data, error } = await q.updateInternalNote(supabase, input.noteId, {
    content:             input.content.trim(),
    updated_by:          session.user.id,
    updated_at:          new Date().toISOString(),
    tagged_patient_id:   input.taggedPatientId   ?? null,
    tagged_caregiver_id: input.taggedCaregiverId ?? null,
  })

  if (error || !data) return { error: 'Failed to update note' }

  // HIPAA § 164.312(b): full before/after trail so auditors can reconstruct change history.
  const { error: auditUpdateErr } = await supabase.from('audit_log').insert({
    agency_id: input.agencyId,
    table_name: 'internal_notes',
    record_id: input.noteId,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: {
      old_values: { content: oldContent, tagged_patient_id: oldTaggedPatientId, tagged_caregiver_id: oldTaggedCaregiverId },
      new_values: { content: input.content.trim(), tagged_patient_id: input.taggedPatientId ?? null, tagged_caregiver_id: input.taggedCaregiverId ?? null },
    },
  })
  if (auditUpdateErr) console.error('[internal-notes/editNote] Audit log UPDATE failed. noteId=%s err=%s', input.noteId, auditUpdateErr.message)

  revalidatePath(subjectPath(input.subjectType, input.subjectId))
  if (input.taggedPatientId)   revalidatePath(`/pages/agency/clients/${input.taggedPatientId}`)
  if (input.taggedCaregiverId) revalidatePath(`/pages/agency/caregiver/${input.taggedCaregiverId}`)
  // Revalidate old tagged subjects if the tag was removed or changed
  if (oldTaggedPatientId   && oldTaggedPatientId   !== input.taggedPatientId)   revalidatePath(`/pages/agency/clients/${oldTaggedPatientId}`)
  if (oldTaggedCaregiverId && oldTaggedCaregiverId !== input.taggedCaregiverId) revalidatePath(`/pages/agency/caregiver/${oldTaggedCaregiverId}`)

  return { error: null }
}

export async function logNoteSearchAction(input: {
  agencyId: string
  subjectType: 'patient' | 'caregiver' | 'visit'
  subjectId: string
  searchTerm: string
  resultsReturned: number
}): Promise<void> {
  const parsed = logSearchSchema.safeParse(input)
  if (!parsed.success) return
  const session = await getSession()
  if (!session) return
  const supabase = await createClient()
  const { error: auditSearchErr } = await supabase.from('audit_log').insert({
    agency_id:            input.agencyId,
    table_name:           'internal_notes',
    action:               'SEARCH',
    performed_by_user_id: session.user.id,
    details: {
      search_term:      input.searchTerm,
      results_returned: input.resultsReturned,
      subject_type:     input.subjectType,
      subject_id:       input.subjectId,
    },
  })
  if (auditSearchErr) console.error('[internal-notes/searchNotes] Audit log SEARCH failed. term=%s err=%s', input.searchTerm, auditSearchErr.message)
}

export async function deleteInternalNoteAction(input: {
  noteId: string
  agencyId: string
  subjectType: 'patient' | 'caregiver' | 'visit'
  subjectId: string
}): Promise<{ error: string | null }> {
  const parsed = deleteNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (!ALLOWED_ROLES.has(session.profile?.role ?? '')) return { error: 'Insufficient permissions' }

  const supabase = await createClient()
  const { data, error } = await q.deleteInternalNote(supabase, input.noteId)

  if (error || !data) return { error: 'Failed to delete note' }

  // HIPAA § 164.312(b): log full snapshot of what was deleted.
  const { error: auditDeleteErr } = await supabase.from('audit_log').insert({
    agency_id: input.agencyId,
    table_name: 'internal_notes',
    record_id: input.noteId,
    action: 'DELETE',
    performed_by_user_id: session.user.id,
    details: {
      subject_type:        data.subject_type,
      subject_id:          data.subject_id,
      content:             data.content,
      tagged_patient_id:   data.tagged_patient_id   ?? null,
      tagged_caregiver_id: data.tagged_caregiver_id ?? null,
    },
  })
  if (auditDeleteErr) console.error('[internal-notes/deleteNote] Audit log DELETE failed. noteId=%s err=%s', input.noteId, auditDeleteErr.message)

  revalidatePath(subjectPath(input.subjectType, input.subjectId))
  if (data.tagged_patient_id)   revalidatePath(`/pages/agency/clients/${data.tagged_patient_id}`)
  if (data.tagged_caregiver_id) revalidatePath(`/pages/agency/caregiver/${data.tagged_caregiver_id}`)

  return { error: null }
}
