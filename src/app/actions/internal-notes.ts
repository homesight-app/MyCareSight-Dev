'use server'

import { revalidatePath } from 'next/cache'
import { readInternalNotesPanel, readApplicationNoteCounts, auditInternalNoteSearch } from '@/lib/repositories/internal-note-reads'
import { createInternalNote, updateInternalNote, deleteInternalNote } from '@/lib/repositories/internal-note-writes'
import type {
  NotePanelReadInput, NoteCountReadInput, NoteCreateInput, NoteUpdateInput,
  NoteDeleteInput, InternalNoteSubjectType,
} from '@/lib/schemas/internal-notes'

const applicationTypes = new Set<InternalNoteSubjectType>([
  'application','application_step','application_document','application_playbook_item',
])

function refresh(
  input:{subjectType:InternalNoteSubjectType;subjectId:string;applicationId?:string|null},
  patientIds:(string|null|undefined)[]=[],
  caregiverIds:(string|null|undefined)[]=[],
) {
  if(input.subjectType==='patient') revalidatePath(`/pages/agency/clients/${input.subjectId}`)
  else if(input.subjectType==='caregiver') revalidatePath(`/pages/agency/caregiver/${input.subjectId}`)
  else if(input.subjectType==='visit') revalidatePath('/pages/agency/care-visits')
  else {
    const id=input.subjectType==='application'?input.subjectId:input.applicationId
    if(id){
      revalidatePath(`/pages/admin/applications/${id}`)
      revalidatePath(`/pages/expert/applications/${id}`)
    }
  }
  if(!applicationTypes.has(input.subjectType)){
    for(const id of new Set(patientIds.filter(Boolean))) revalidatePath(`/pages/agency/clients/${id}`)
    for(const id of new Set(caregiverIds.filter(Boolean))) revalidatePath(`/pages/agency/caregiver/${id}`)
  }
}

export async function getInternalNotesPanelDataAction(input:NotePanelReadInput){return readInternalNotesPanel(input)}
export async function getApplicationNoteCountsAction(input:NoteCountReadInput){return readApplicationNoteCounts(input)}
export async function logNoteSearchAction(input:Parameters<typeof auditInternalNoteSearch>[0]){return auditInternalNoteSearch(input)}

export async function addInternalNoteAction(input:NoteCreateInput){
  const result=await createInternalNote(input)
  if(!result.error) refresh(input,[input.taggedPatientId],[input.taggedCaregiverId])
  return result
}

export async function editInternalNoteAction(input:NoteUpdateInput){
  const result=await updateInternalNote(input)
  if(!result.error) refresh(input,[input.taggedPatientId,result.oldTaggedPatientId],[input.taggedCaregiverId,result.oldTaggedCaregiverId])
  return {error:result.error}
}

export async function deleteInternalNoteAction(input:NoteDeleteInput){
  const result=await deleteInternalNote(input)
  if(!result.error) refresh(input,[result.taggedPatientId],[result.taggedCaregiverId])
  return {error:result.error}
}
