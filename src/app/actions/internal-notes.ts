'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import type { InternalNoteSubjectType } from '@/lib/supabase/query/internal-notes'

// agency_admin is the current role string. company_owner is a legacy alias kept
// here only during the transition period — remove it once the rename is complete.
// RLS via hs_can_manage_agency() (checks agency_admins table, not this string)
// is the primary enforcement gate; this check is defense-in-depth only.
const AGENCY_ROLES = new Set(['agency_admin', 'company_owner', 'care_coordinator'])
const PLATFORM_ROLES = new Set(['admin', 'expert'])
const APPLICATION_SUBJECT_TYPES = new Set(['application', 'application_step', 'application_document', 'application_playbook_item'])

function isAllowedRole(subjectType: InternalNoteSubjectType, role: string): boolean {
  if (APPLICATION_SUBJECT_TYPES.has(subjectType)) return PLATFORM_ROLES.has(role)
  return AGENCY_ROLES.has(role)
}

const subjectTypeSchema = z.enum([
  'patient', 'caregiver', 'visit',
  'application', 'application_step', 'application_document',
  'application_playbook_item',
])

const addNoteSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  agencyId: z.string().min(1),
  content: z.string().min(1, 'Note content cannot be empty'),
  applicationId: z.string().nullable().optional(),
  taggedPatientId: z.string().nullable().optional(),
  taggedCaregiverId: z.string().nullable().optional(),
})

const editNoteSchema = z.object({
  noteId: z.string().min(1),
  content: z.string().min(1, 'Note content cannot be empty'),
  agencyId: z.string().min(1),
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  applicationId: z.string().nullable().optional(),
  taggedPatientId: z.string().nullable().optional(),
  taggedCaregiverId: z.string().nullable().optional(),
})

const deleteNoteSchema = z.object({
  noteId: z.string().min(1),
  agencyId: z.string().min(1),
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  applicationId: z.string().nullable().optional(),
})

const logSearchSchema = z.object({
  agencyId: z.string().min(1),
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  searchTerm: z.string(),
  resultsReturned: z.number().int().min(0),
})

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>

type NoteRow = {
  id: string
  content: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string | null
  tagged_patient_id: string | null
  tagged_caregiver_id: string | null
  author: { full_name: string | null } | null
  updater: { full_name: string | null } | null
  tagged_patient: { id: string; first_name: string; last_name: string } | null
  tagged_caregiver: { id: string; first_name: string; last_name: string } | null
}

type AssociatedNoteRow = {
  id: string
  content: string
  subject_type: string
  subject_id: string
  created_at: string
  tagged_patient_id: string | null
  tagged_caregiver_id: string | null
  author: { full_name: string | null } | null
}

type CaregiverTagOption = {
  id: string
  first_name: string
  last_name: string
}

function subjectPath(subjectType: InternalNoteSubjectType, subjectId: string, applicationId?: string | null): string {
  if (subjectType === 'patient')   return `/pages/agency/clients/${subjectId}`
  if (subjectType === 'caregiver') return `/pages/agency/caregiver/${subjectId}`
  if (subjectType === 'visit')     return `/pages/agency/care-visits`
  // application note types — revalidate both admin + expert views
  const appId = subjectType === 'application' ? subjectId : (applicationId ?? '')
  return appId ? `/pages/admin/applications/${appId}` : '/pages/admin/applications'
}

function revalidateApplicationPaths(subjectType: InternalNoteSubjectType, subjectId: string, applicationId?: string | null) {
  if (!APPLICATION_SUBJECT_TYPES.has(subjectType)) return
  const appId = subjectType === 'application' ? subjectId : (applicationId ?? '')
  if (!appId) return
  revalidatePath(`/pages/admin/applications/${appId}`)
  revalidatePath(`/pages/expert/applications/${appId}`)
}

function canUseAgency(session: Session, agencyId: string, subjectType: InternalNoteSubjectType): boolean {
  const role = session.profile?.role ?? ''
  if (APPLICATION_SUBJECT_TYPES.has(subjectType)) return PLATFORM_ROLES.has(role)
  if (PLATFORM_ROLES.has(role)) return true
  return AGENCY_ROLES.has(role) && session.profile?.agency_id === agencyId
}

async function agencySubjectExists(subjectType: InternalNoteSubjectType, subjectId: string, agencyId: string): Promise<boolean> {
  if (subjectType === 'patient') {
    const rows = await sql`SELECT id FROM patients WHERE id = ${subjectId} AND agency_id = ${agencyId} LIMIT 1`
    return rows.length > 0
  }
  if (subjectType === 'caregiver') {
    const rows = await sql`SELECT id FROM caregiver_members WHERE id = ${subjectId} AND agency_id = ${agencyId} LIMIT 1`
    return rows.length > 0
  }
  if (subjectType === 'visit') {
    const rows = await sql`SELECT id FROM scheduled_visits WHERE id = ${subjectId} AND agency_id = ${agencyId} LIMIT 1`
    return rows.length > 0
  }
  return APPLICATION_SUBJECT_TYPES.has(subjectType)
}

async function validateTagsForAgency(taggedPatientId: string | null | undefined, taggedCaregiverId: string | null | undefined, agencyId: string): Promise<boolean> {
  if (taggedPatientId) {
    const rows = await sql`SELECT id FROM patients WHERE id = ${taggedPatientId} AND agency_id = ${agencyId} LIMIT 1`
    if (rows.length === 0) return false
  }
  if (taggedCaregiverId) {
    const rows = await sql`SELECT id FROM caregiver_members WHERE id = ${taggedCaregiverId} AND agency_id = ${agencyId} LIMIT 1`
    if (rows.length === 0) return false
  }
  return true
}

async function validateAgencyAccess(
  session: Session,
  input: {
    agencyId: string
    subjectType: InternalNoteSubjectType
    subjectId: string
    taggedPatientId?: string | null
    taggedCaregiverId?: string | null
  }
): Promise<string | null> {
  if (!canUseAgency(session, input.agencyId, input.subjectType)) return 'Insufficient permissions'
  if (!(await agencySubjectExists(input.subjectType, input.subjectId, input.agencyId))) {
    return 'Subject not found or not authorized'
  }
  if (APPLICATION_SUBJECT_TYPES.has(input.subjectType)) return null
  if (!(await validateTagsForAgency(input.taggedPatientId, input.taggedCaregiverId, input.agencyId))) {
    return 'Tagged record not found or not authorized'
  }
  return null
}

export async function getInternalNotesPanelDataAction(input: {
  subjectType: InternalNoteSubjectType
  subjectId: string
  agencyId: string
}): Promise<{
  error: string | null
  notes: NoteRow[]
  associatedNotes: AssociatedNoteRow[]
  caregivers: CaregiverTagOption[]
}> {
  const parsed = z.object({
    subjectType: subjectTypeSchema,
    subjectId: z.string().min(1),
    agencyId: z.string().min(1),
  }).safeParse(input)
  if (!parsed.success) return { error: 'Invalid input', notes: [], associatedNotes: [], caregivers: [] }

  const session = await getSession()
  if (!session) return { error: 'Not authenticated', notes: [], associatedNotes: [], caregivers: [] }
  if (!isAllowedRole(input.subjectType, session.profile?.role ?? '')) {
    return { error: 'Insufficient permissions', notes: [], associatedNotes: [], caregivers: [] }
  }

  return withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const accessError = await validateAgencyAccess(session, input)
    if (accessError) return { error: accessError, notes: [], associatedNotes: [], caregivers: [] }

    const isAppNote = APPLICATION_SUBJECT_TYPES.has(input.subjectType)

    const notes = await sql<NoteRow[]>`
      SELECT
        n.id, n.content, n.created_at, n.updated_at, n.created_by, n.updated_by,
        n.tagged_patient_id, n.tagged_caregiver_id,
        json_build_object('full_name', author.full_name) AS author,
        json_build_object('full_name', updater.full_name) AS updater,
        CASE
          WHEN tp.id IS NOT NULL THEN json_build_object('id', tp.id, 'first_name', tp.first_name, 'last_name', tp.last_name)
          ELSE NULL
        END AS tagged_patient,
        CASE
          WHEN tc.id IS NOT NULL THEN json_build_object('id', tc.id, 'first_name', tc.first_name, 'last_name', tc.last_name)
          ELSE NULL
        END AS tagged_caregiver
      FROM internal_notes n
      LEFT JOIN user_profiles author ON author.id = n.created_by
      LEFT JOIN user_profiles updater ON updater.id = n.updated_by
      LEFT JOIN patients tp ON tp.id = n.tagged_patient_id
      LEFT JOIN caregiver_members tc ON tc.id = n.tagged_caregiver_id
      WHERE n.agency_id = ${input.agencyId}
        AND n.subject_type = ${input.subjectType}
        AND n.subject_id = ${input.subjectId}
      ORDER BY n.created_at DESC
    `

    const associatedNotes = isAppNote
      ? []
      : input.subjectType === 'patient'
        ? await sql<AssociatedNoteRow[]>`
            SELECT
              n.id, n.content, n.subject_type, n.subject_id, n.created_at,
              n.tagged_patient_id, n.tagged_caregiver_id,
              json_build_object('full_name', up.full_name) AS author
            FROM internal_notes n
            LEFT JOIN user_profiles up ON up.id = n.created_by
            WHERE n.agency_id = ${input.agencyId}
              AND n.tagged_patient_id = ${input.subjectId}
            ORDER BY n.created_at DESC
          `
        : input.subjectType === 'caregiver'
          ? await sql<AssociatedNoteRow[]>`
              SELECT
                n.id, n.content, n.subject_type, n.subject_id, n.created_at,
                n.tagged_patient_id, n.tagged_caregiver_id,
                json_build_object('full_name', up.full_name) AS author
              FROM internal_notes n
              LEFT JOIN user_profiles up ON up.id = n.created_by
              WHERE n.agency_id = ${input.agencyId}
                AND n.tagged_caregiver_id = ${input.subjectId}
              ORDER BY n.created_at DESC
            `
          : []

    const caregivers = isAppNote
      ? []
      : await sql<CaregiverTagOption[]>`
          SELECT id, first_name, last_name
          FROM caregiver_members
          WHERE agency_id = ${input.agencyId}
          ORDER BY last_name ASC
        `

    return {
      error: null,
      notes,
      associatedNotes: associatedNotes.filter((n) => !(n.subject_type === input.subjectType && n.subject_id === input.subjectId)),
      caregivers,
    }
  })
}

export async function addInternalNoteAction(input: {
  subjectType: InternalNoteSubjectType
  subjectId: string
  agencyId: string
  content: string
  applicationId?: string | null
  taggedPatientId?: string | null
  taggedCaregiverId?: string | null
}): Promise<{ error: string | null; id?: string }> {
  const parsed = addNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (!isAllowedRole(input.subjectType, session.profile?.role ?? '')) return { error: 'Insufficient permissions' }

  const result = await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const isAppNote = APPLICATION_SUBJECT_TYPES.has(input.subjectType)
    const accessError = await validateAgencyAccess(session, {
      ...input,
      taggedPatientId: isAppNote ? null : input.taggedPatientId,
      taggedCaregiverId: isAppNote ? null : input.taggedCaregiverId,
    })
    if (accessError) return { error: accessError }

    const { data, error } = await q.insertInternalNote({
      agency_id: input.agencyId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      content: input.content.trim(),
      created_by: session.user.id,
      tagged_patient_id:   isAppNote ? null : (input.taggedPatientId   ?? null),
      tagged_caregiver_id: isAppNote ? null : (input.taggedCaregiverId ?? null),
    })

    if (error || !data) return { error: 'Failed to save note' }

    const { error: auditInsertErr } = await q.insertAuditLog({
      agency_id: input.agencyId,
      table_name: 'internal_notes',
      record_id: data.id,
      action: 'INSERT',
      performed_by_user_id: session.user.id,
      details: {
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        tagged_patient: Boolean(!isAppNote && input.taggedPatientId),
        tagged_caregiver: Boolean(!isAppNote && input.taggedCaregiverId),
        content_length: input.content.trim().length,
      },
    })
    if (auditInsertErr) console.error('[internal-notes/addNote] Audit log INSERT failed. noteId=%s err=%s', data.id, auditInsertErr.message)

    return { error: null, id: data.id }
  })
  if (result.error) return result

  revalidatePath(subjectPath(input.subjectType, input.subjectId, input.applicationId))
  revalidateApplicationPaths(input.subjectType, input.subjectId, input.applicationId)
  const isAppNote = APPLICATION_SUBJECT_TYPES.has(input.subjectType)
  if (!isAppNote) {
    if (input.taggedPatientId)   revalidatePath(`/pages/agency/clients/${input.taggedPatientId}`)
    if (input.taggedCaregiverId) revalidatePath(`/pages/agency/caregiver/${input.taggedCaregiverId}`)
  }

  return result
}

export async function editInternalNoteAction(input: {
  noteId: string
  content: string
  agencyId: string
  subjectType: InternalNoteSubjectType
  subjectId: string
  applicationId?: string | null
  taggedPatientId?: string | null
  taggedCaregiverId?: string | null
}): Promise<{ error: string | null }> {
  const parsed = editNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (!isAllowedRole(input.subjectType, session.profile?.role ?? '')) return { error: 'Insufficient permissions' }

  const result = await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const isAppNote = APPLICATION_SUBJECT_TYPES.has(input.subjectType)
    const accessError = await validateAgencyAccess(session, {
      ...input,
      taggedPatientId: isAppNote ? null : input.taggedPatientId,
      taggedCaregiverId: isAppNote ? null : input.taggedCaregiverId,
    })
    if (accessError) return { error: accessError }

    const [existing] = await sql<{
      id: string
      content: string
      tagged_patient_id: string | null
      tagged_caregiver_id: string | null
    }[]>`
      SELECT id, content, tagged_patient_id, tagged_caregiver_id
      FROM internal_notes
      WHERE id = ${input.noteId}
        AND agency_id = ${input.agencyId}
        AND subject_type = ${input.subjectType}
        AND subject_id = ${input.subjectId}
      LIMIT 1
    `
    if (!existing) return { error: 'Note not found or not authorized' }

    const rows = await sql<{ id: string }[]>`
      UPDATE internal_notes
      SET
        content = ${input.content.trim()},
        updated_by = ${session.user.id},
        updated_at = ${new Date().toISOString()},
        tagged_patient_id = ${isAppNote ? null : (input.taggedPatientId ?? null)},
        tagged_caregiver_id = ${isAppNote ? null : (input.taggedCaregiverId ?? null)}
      WHERE id = ${input.noteId}
        AND agency_id = ${input.agencyId}
      RETURNING id
    `
    if (!rows[0]) return { error: 'Failed to update note' }

    const oldTaggedPatientId = existing.tagged_patient_id
    const oldTaggedCaregiverId = existing.tagged_caregiver_id
    const { error: auditUpdateErr } = await q.insertAuditLog({
      agency_id: input.agencyId,
      table_name: 'internal_notes',
      record_id: input.noteId,
      action: 'UPDATE',
      performed_by_user_id: session.user.id,
      details: {
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        old_content_length: existing.content.length,
        new_content_length: input.content.trim().length,
        tagged_patient_changed: oldTaggedPatientId !== (isAppNote ? null : (input.taggedPatientId ?? null)),
        tagged_caregiver_changed: oldTaggedCaregiverId !== (isAppNote ? null : (input.taggedCaregiverId ?? null)),
      },
    })
    if (auditUpdateErr) console.error('[internal-notes/editNote] Audit log UPDATE failed. noteId=%s err=%s', input.noteId, auditUpdateErr.message)

    return { error: null, oldTaggedPatientId, oldTaggedCaregiverId }
  })
  if (result.error) return { error: result.error }

  revalidatePath(subjectPath(input.subjectType, input.subjectId, input.applicationId))
  revalidateApplicationPaths(input.subjectType, input.subjectId, input.applicationId)
  const isAppNote = APPLICATION_SUBJECT_TYPES.has(input.subjectType)
  if (!isAppNote) {
    if (input.taggedPatientId)   revalidatePath(`/pages/agency/clients/${input.taggedPatientId}`)
    if (input.taggedCaregiverId) revalidatePath(`/pages/agency/caregiver/${input.taggedCaregiverId}`)
    if (result.oldTaggedPatientId   && result.oldTaggedPatientId   !== input.taggedPatientId)   revalidatePath(`/pages/agency/clients/${result.oldTaggedPatientId}`)
    if (result.oldTaggedCaregiverId && result.oldTaggedCaregiverId !== input.taggedCaregiverId) revalidatePath(`/pages/agency/caregiver/${result.oldTaggedCaregiverId}`)
  }

  return { error: null }
}

export async function logNoteSearchAction(input: {
  agencyId: string
  subjectType: InternalNoteSubjectType
  subjectId: string
  searchTerm: string
  resultsReturned: number
}): Promise<void> {
  const parsed = logSearchSchema.safeParse(input)
  if (!parsed.success) return
  const session = await getSession()
  if (!session) return

  await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const accessError = await validateAgencyAccess(session, input)
    if (accessError) return

    const { error: auditSearchErr } = await q.insertAuditLog({
      agency_id:            input.agencyId,
      table_name:           'internal_notes',
      record_id:            null,
      action:               'SEARCH',
      performed_by_user_id: session.user.id,
      details: {
        search_length:    input.searchTerm.trim().length,
        results_returned: input.resultsReturned,
        subject_type:     input.subjectType,
        subject_id:       input.subjectId,
      },
    })
    if (auditSearchErr) console.error('[internal-notes/searchNotes] Audit log SEARCH failed. length=%s err=%s', input.searchTerm.trim().length, auditSearchErr.message)
  })
}

export async function deleteInternalNoteAction(input: {
  noteId: string
  agencyId: string
  subjectType: InternalNoteSubjectType
  subjectId: string
  applicationId?: string | null
}): Promise<{ error: string | null }> {
  const parsed = deleteNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (!isAllowedRole(input.subjectType, session.profile?.role ?? '')) return { error: 'Insufficient permissions' }

  const result = await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const accessError = await validateAgencyAccess(session, input)
    if (accessError) return { error: accessError }

    const rows = await sql<{
      id: string
      content: string
      subject_type: InternalNoteSubjectType
      subject_id: string
      tagged_patient_id: string | null
      tagged_caregiver_id: string | null
    }[]>`
      DELETE FROM internal_notes
      WHERE id = ${input.noteId}
        AND agency_id = ${input.agencyId}
        AND subject_type = ${input.subjectType}
        AND subject_id = ${input.subjectId}
      RETURNING id, content, subject_type, subject_id, tagged_patient_id, tagged_caregiver_id
    `
    const data = rows[0]
    if (!data) return { error: 'Failed to delete note' }

    const { error: auditDeleteErr } = await q.insertAuditLog({
      agency_id: input.agencyId,
      table_name: 'internal_notes',
      record_id: input.noteId,
      action: 'DELETE',
      performed_by_user_id: session.user.id,
      details: {
        subject_type: data.subject_type,
        subject_id: data.subject_id,
        content_length: data.content.length,
        tagged_patient: Boolean(data.tagged_patient_id),
        tagged_caregiver: Boolean(data.tagged_caregiver_id),
      },
    })
    if (auditDeleteErr) console.error('[internal-notes/deleteNote] Audit log DELETE failed. noteId=%s err=%s', input.noteId, auditDeleteErr.message)

    return {
      error: null,
      taggedPatientId: data.tagged_patient_id,
      taggedCaregiverId: data.tagged_caregiver_id,
    }
  })
  if (result.error) return { error: result.error }

  revalidatePath(subjectPath(input.subjectType, input.subjectId, input.applicationId))
  revalidateApplicationPaths(input.subjectType, input.subjectId, input.applicationId)
  const isAppNote = APPLICATION_SUBJECT_TYPES.has(input.subjectType)
  if (!isAppNote) {
    if (result.taggedPatientId)   revalidatePath(`/pages/agency/clients/${result.taggedPatientId}`)
    if (result.taggedCaregiverId) revalidatePath(`/pages/agency/caregiver/${result.taggedCaregiverId}`)
  }

  return { error: null }
}
