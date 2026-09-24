import { readLegacyInternalNotes } from '@/lib/repositories/internal-note-reads'
import type { InternalNoteSubjectType } from '@/lib/schemas/internal-notes'
export type { InternalNoteSubjectType } from '@/lib/schemas/internal-notes'

export async function getInternalNotesBySubject(subjectType: InternalNoteSubjectType, subjectId: string) {
  return readLegacyInternalNotes('subject',subjectId,subjectType)
}

export async function getAssociatedNotesByPatient(patientId: string) {
  return readLegacyInternalNotes('patient',patientId)
}

export async function getAssociatedNotesByCaregiver(caregiverId: string) {
  return readLegacyInternalNotes('caregiver',caregiverId)
}

export async function getInternalNoteById(id: string) {
  const result=await readLegacyInternalNotes('id',id)
  return {data:result.data?.[0] ?? null,error:result.error ?? (result.data?.length ? null : new Error('Not found'))}
}
