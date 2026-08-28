'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'
import { uploadFile, removeFiles } from '@/lib/storage/client'

function revalidatePatientPages(patientId: string) {
  revalidatePath('/pages/agency/clients')
  revalidatePath(`/pages/agency/clients/${patientId}`)
}

/**
 * Upload one or more patient documents. Files are appended to existingDocs and persisted in
 * the patients.documents JSONB column. Accepts files via FormData field 'file' (repeatable).
 */
export async function uploadPatientDocumentsAction(
  patientId: string,
  formData: FormData,
  existingDocs: PatientDocument[]
): Promise<{ error: string | null; data: PatientDocument[] | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', data: null }

  const files = formData.getAll('file') as File[]
  if (files.length === 0) return { error: 'No files provided', data: null }

  const uploadedPaths: string[] = []
  const newDocs: PatientDocument[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const docId = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${patientId}/${docId}_${safeName}`

    const { error: uploadErr } = await uploadFile(supabase, STORAGE_BUCKET.PATIENT, path, file)
    if (uploadErr) {
      await removeFiles(supabase, STORAGE_BUCKET.PATIENT, uploadedPaths)
      return { error: uploadErr.message, data: null }
    }
    uploadedPaths.push(path)
    newDocs.push({ id: docId, name: file.name, path, uploaded_at: new Date().toISOString(), size: file.size })
  }

  const nextDocs = [...existingDocs, ...newDocs]
  const { error: updateErr } = await q.updatePatientDocuments(supabase, patientId, nextDocs)
  if (updateErr) {
    await removeFiles(supabase, STORAGE_BUCKET.PATIENT, uploadedPaths)
    return { error: updateErr.message, data: null }
  }

  const { data: patient } = await supabase
    .from('patients')
    .select('agency_id')
    .eq('id', patientId)
    .maybeSingle()

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: patient?.agency_id ?? null,
    table_name: 'patients',
    record_id: patientId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { field: 'documents', added: newDocs.length, total: nextDocs.length },
  })
  if (auditErr) console.error('[patient-documents/upload] Audit log failed. patientId=%s err=%s', patientId, auditErr.message)

  revalidatePatientPages(patientId)
  return { error: null, data: nextDocs }
}

/** Remove a single patient document from storage and persist the updated document list. */
export async function deletePatientDocumentAction(
  patientId: string,
  docPath: string,
  updatedDocs: PatientDocument[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  await removeFiles(supabase, STORAGE_BUCKET.PATIENT, [docPath])

  const { error: updateErr } = await q.updatePatientDocuments(supabase, patientId, updatedDocs)
  if (updateErr) return { error: updateErr.message }

  const { data: patient } = await supabase
    .from('patients')
    .select('agency_id')
    .eq('id', patientId)
    .maybeSingle()

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: patient?.agency_id ?? null,
    table_name: 'patients',
    record_id: patientId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { field: 'documents', operation: 'delete', deleted_path: docPath, remaining: updatedDocs.length },
  })
  if (auditErr) console.error('[patient-documents/delete] Audit log failed. patientId=%s err=%s', patientId, auditErr.message)

  revalidatePatientPages(patientId)
  return { error: null }
}
