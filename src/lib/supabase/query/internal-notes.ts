import type { SupabaseClient } from '@supabase/supabase-js'

export type InternalNoteSubjectType =
  | 'patient'
  | 'caregiver'
  | 'visit'
  | 'application'
  | 'application_step'
  | 'application_document'

export async function getInternalNotesBySubject(
  supabase: SupabaseClient,
  subjectType: InternalNoteSubjectType,
  subjectId: string
) {
  return supabase
    .from('internal_notes')
    .select(`
      id,
      content,
      subject_type,
      subject_id,
      agency_id,
      created_at,
      updated_at,
      created_by,
      updated_by,
      tagged_patient_id,
      tagged_caregiver_id,
      author:user_profiles!internal_notes_created_by_fkey(full_name),
      updater:user_profiles!internal_notes_updated_by_fkey(full_name),
      tagged_patient:patients!internal_notes_tagged_patient_id_fkey(id, first_name, last_name),
      tagged_caregiver:caregiver_members!internal_notes_tagged_caregiver_id_fkey(id, first_name, last_name)
    `)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
}

export async function getAssociatedNotesByPatient(supabase: SupabaseClient, patientId: string) {
  return supabase
    .from('internal_notes')
    .select(`
      id,
      content,
      subject_type,
      subject_id,
      agency_id,
      created_at,
      tagged_patient_id,
      tagged_caregiver_id,
      author:user_profiles!internal_notes_created_by_fkey(full_name)
    `)
    .eq('tagged_patient_id', patientId)
    .order('created_at', { ascending: false })
}

export async function getAssociatedNotesByCaregiver(supabase: SupabaseClient, caregiverId: string) {
  return supabase
    .from('internal_notes')
    .select(`
      id,
      content,
      subject_type,
      subject_id,
      agency_id,
      created_at,
      tagged_patient_id,
      tagged_caregiver_id,
      author:user_profiles!internal_notes_created_by_fkey(full_name)
    `)
    .eq('tagged_caregiver_id', caregiverId)
    .order('created_at', { ascending: false })
}

export async function insertInternalNote(
  supabase: SupabaseClient,
  data: {
    agency_id: string
    subject_type: string
    subject_id: string
    content: string
    created_by: string
    tagged_patient_id?: string | null
    tagged_caregiver_id?: string | null
  }
) {
  return supabase
    .from('internal_notes')
    .insert(data)
    .select('id')
    .single()
}

export async function updateInternalNote(
  supabase: SupabaseClient,
  id: string,
  updates: {
    content: string
    updated_by: string
    updated_at: string
    tagged_patient_id?: string | null
    tagged_caregiver_id?: string | null
  }
) {
  return supabase
    .from('internal_notes')
    .update(updates)
    .eq('id', id)
    .select('id, content')
    .single()
}

export async function getInternalNoteById(supabase: SupabaseClient, id: string) {
  return supabase
    .from('internal_notes')
    .select('id, content, subject_type, subject_id, agency_id, tagged_patient_id, tagged_caregiver_id')
    .eq('id', id)
    .single()
}

export async function deleteInternalNote(supabase: SupabaseClient, id: string) {
  return supabase
    .from('internal_notes')
    .delete()
    .eq('id', id)
    .select('id, content, subject_type, subject_id, agency_id, tagged_patient_id, tagged_caregiver_id')
    .single()
}
