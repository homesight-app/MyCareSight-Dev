'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'
import { uploadFile, removeFiles } from '@/lib/storage/client'

function revalidateCaregiverPages(staffMemberId: string) {
  revalidatePath(`/pages/agency/caregiver/${staffMemberId}`)
  revalidatePath('/pages/agency/caregiver')
}

/**
 * Upload one or more caregiver documents. Files are appended to existingDocs and persisted in
 * the caregiver_members.documents JSONB column. Accepts files via FormData field 'file' (repeatable).
 */
export async function uploadCaregiverDocumentsAction(
  staffMemberId: string,
  formData: FormData,
  existingDocs: PatientDocument[]
): Promise<{ error: string | null; data: PatientDocument[] | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', data: null }

  const files = formData.getAll('file') as File[]
  if (files.length === 0) return { error: 'No files provided', data: null }

  const { data: member } = await supabase
    .from('caregiver_members')
    .select('agency_id')
    .eq('id', staffMemberId)
    .maybeSingle()

  const uploadedPaths: string[] = []
  const newDocs: PatientDocument[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const docId = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${staffMemberId}/${docId}_${safeName}`

    const { error: uploadErr } = await uploadFile(supabase, STORAGE_BUCKET.STAFF_MEMBER, path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadErr) {
      await removeFiles(supabase, STORAGE_BUCKET.STAFF_MEMBER, uploadedPaths)
      return { error: uploadErr.message, data: null }
    }
    uploadedPaths.push(path)
    newDocs.push({ id: docId, name: file.name, path, uploaded_at: new Date().toISOString(), size: file.size })
  }

  const nextDocs = [...existingDocs, ...newDocs]
  const { data: updated, error: updateErr } = await q.updateStaffMemberDocuments(supabase, staffMemberId, nextDocs)
  if (updateErr || !updated) {
    await removeFiles(supabase, STORAGE_BUCKET.STAFF_MEMBER, uploadedPaths)
    return { error: updateErr?.message ?? 'Update returned no row', data: null }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: member?.agency_id ?? null,
    table_name: 'caregiver_members',
    record_id: staffMemberId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { field: 'documents', added: newDocs.length, total: nextDocs.length },
  })
  if (auditErr) console.error('[caregiver-documents/upload] Audit log failed. staffMemberId=%s err=%s', staffMemberId, auditErr.message)

  revalidateCaregiverPages(staffMemberId)
  return { error: null, data: nextDocs }
}

/** Remove a single caregiver document from storage and persist the updated document list. */
export async function deleteCaregiverDocumentAction(
  staffMemberId: string,
  docPath: string,
  updatedDocs: PatientDocument[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('caregiver_members')
    .select('agency_id')
    .eq('id', staffMemberId)
    .maybeSingle()

  await removeFiles(supabase, STORAGE_BUCKET.STAFF_MEMBER, [docPath])

  const { data: updated, error: updateErr } = await q.updateStaffMemberDocuments(supabase, staffMemberId, updatedDocs)
  if (updateErr || !updated) return { error: updateErr?.message ?? 'Update returned no row' }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: member?.agency_id ?? null,
    table_name: 'caregiver_members',
    record_id: staffMemberId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { field: 'documents', operation: 'delete', deleted_path: docPath, remaining: updatedDocs.length },
  })
  if (auditErr) console.error('[caregiver-documents/delete] Audit log failed. staffMemberId=%s err=%s', staffMemberId, auditErr.message)

  revalidateCaregiverPages(staffMemberId)
  return { error: null }
}
