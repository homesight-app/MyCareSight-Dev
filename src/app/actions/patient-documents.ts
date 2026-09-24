'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import { STORAGE_BUCKET } from '@/lib/storage'
import { uploadFile, removeFiles } from '@/lib/storage/client'

function revalidatePatientPages(patientId: string) {
  revalidatePath('/pages/agency/clients')
  revalidatePath(`/pages/agency/clients/${patientId}`)
}

function normalizeDocuments(value: unknown): PatientDocument[] {
  return Array.isArray(value)
    ? value.filter((doc): doc is PatientDocument =>
        !!doc &&
        typeof doc === 'object' &&
        typeof (doc as PatientDocument).id === 'string' &&
        typeof (doc as PatientDocument).path === 'string'
      )
    : []
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
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  void existingDocs

  const files = formData.getAll('file') as File[]
  if (files.length === 0) return { error: 'No files provided', data: null }

  // Authorize: verify patient belongs to viewer's agency BEFORE touching storage.
  // withUserContext + patients RLS enforces agency isolation here.
  const authorized = await withUserContext(session.user.id, role, agencyId, async () => {
    const [row] = await sql<{ agency_id: string }[]>`
      SELECT agency_id
      FROM patients
      WHERE id = ${patientId}
      LIMIT 1
    `
    return row ? { agencyId: row.agency_id } : null
  })
  if (!authorized) return { error: 'Patient not found or not authorized', data: null }

  const uploadedPaths: string[] = []
  const newDocs: PatientDocument[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const docId = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${patientId}/${docId}_${safeName}`

    const { error: uploadErr } = await uploadFile(STORAGE_BUCKET.PATIENT, path, file)
    if (uploadErr) {
      await removeFiles(STORAGE_BUCKET.PATIENT, uploadedPaths)
      return { error: uploadErr.message, data: null }
    }
    uploadedPaths.push(path)
    newDocs.push({ id: docId, name: file.name, path, uploaded_at: new Date().toISOString(), size: file.size })
  }

  const updateResult = await withUserContext(session.user.id, role, agencyId, async () => {
    const [row] = await sql<{ documents: unknown }[]>`
      SELECT documents
      FROM patients
      WHERE id = ${patientId}
      LIMIT 1
      FOR UPDATE
    `
    if (!row) return { error: 'Patient not found or not authorized', data: null as PatientDocument[] | null }

    const nextDocs = [...normalizeDocuments(row.documents), ...newDocs]
    const { error } = await q.updatePatientDocuments(patientId, nextDocs)
    if (error) return { error: error.message, data: null as PatientDocument[] | null }
    return { error: null, data: nextDocs }
  })
  if (updateResult.error || !updateResult.data) {
    await removeFiles(STORAGE_BUCKET.PATIENT, uploadedPaths)
    return { error: updateResult.error ?? 'Update failed', data: null }
  }

  // Audit: log only metadata — never log filenames or paths (PHI)
  const { error: auditErr } = await q.insertAuditLog({
    agency_id: authorized.agencyId,
    table_name: 'patients',
    record_id: patientId,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: { field: 'documents', added: newDocs.length, total: updateResult.data.length },
  })
  if (auditErr) console.error('[patient-documents/upload] Audit log failed. patientId=%s err=%s', patientId, auditErr.message)

  revalidatePatientPages(patientId)
  return { error: null, data: updateResult.data }
}

/** Remove a single patient document from storage and persist the updated document list. */
export async function deletePatientDocumentAction(
  patientId: string,
  docPath: string,
  updatedDocs: PatientDocument[]
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  void updatedDocs

  // Validate path is scoped to this patient (prevents path traversal)
  if (!docPath.startsWith(`${patientId}/`)) return { error: 'Document not found' }

  const updateResult = await withUserContext(session.user.id, role, agencyId, async () => {
    const [row] = await sql<{ agency_id: string; documents: unknown }[]>`
      SELECT agency_id, documents
      FROM patients
      WHERE id = ${patientId}
      LIMIT 1
      FOR UPDATE
    `
    if (!row?.agency_id) return { error: 'Patient not found or not authorized' }

    const currentDocs = normalizeDocuments(row.documents)
    if (!currentDocs.some((doc) => doc.path === docPath)) {
      return { error: 'Document not found' }
    }

    const nextDocs = currentDocs.filter((doc) => doc.path !== docPath)
    const { error } = await q.updatePatientDocuments(patientId, nextDocs)
    if (error) return { error: error.message }

    return { error: null, agencyId: row.agency_id, remaining: nextDocs.length }
  })
  if (updateResult.error) return { error: updateResult.error }

  await removeFiles(STORAGE_BUCKET.PATIENT, [docPath])

  // Audit: log only metadata — never log paths or filenames (PHI)
  const { error: auditErr } = await q.insertAuditLog({
    agency_id: updateResult.agencyId,
    table_name: 'patients',
    record_id: patientId,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: { field: 'documents', operation: 'delete', remaining: updateResult.remaining },
  })
  if (auditErr) console.error('[patient-documents/delete] Audit log failed. patientId=%s err=%s', patientId, auditErr.message)

  revalidatePatientPages(patientId)
  return { error: null }
}
