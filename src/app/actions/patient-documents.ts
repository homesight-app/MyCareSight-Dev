'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import { readPatientDocuments } from '@/lib/patient-document-metadata'
import { commitPatientDocumentSchema } from '@/lib/schemas/patient-documents'
import { STORAGE_BUCKET } from '@/lib/storage'
import { removeFiles } from '@/lib/storage/client'
import { readStorageCleanupToken } from '@/lib/storage/cleanup-token'

function revalidatePatientPages(patientId: string) {
  revalidatePath('/pages/agency/clients')
  revalidatePath(`/pages/agency/clients/${patientId}`)
}

/** Commit a file uploaded through the authorized storage API to the patient document list. */
export async function commitPatientDocumentUploadAction(
  input: unknown
): Promise<{ error: string | null; data: PatientDocument[] | null }> {
  const parsed = commitPatientDocumentSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid document upload', data: null }

  const { patientId, upload, name, size } = parsed.data
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }
  const claim = readStorageCleanupToken(upload.cleanupToken)
  if (
    !claim || claim.actorId !== session.user.id
    || claim.bucket !== STORAGE_BUCKET.PATIENT
    || claim.tableName !== 'patients'
    || claim.recordId !== patientId
    || claim.path !== upload.path
    || !claim.path.startsWith(`${patientId}/`)
  ) return { error: 'Invalid document upload', data: null }

  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  const result = await withUserContext(session.user.id, role, agencyId, async () => {
    const [row] = await sql<{ agency_id: string; documents: unknown }[]>`
      SELECT agency_id, documents FROM patients WHERE id = ${patientId} LIMIT 1 FOR UPDATE
    `
    if (!row || row.agency_id !== claim.agencyId) return null

    const current = readPatientDocuments(row.documents)
    if (current.some((doc) => doc.path === upload.path)) return null
    const document: PatientDocument = {
      id: randomUUID(), name, path: upload.path, uploaded_at: new Date().toISOString(), size,
    }
    const nextDocs = [...current, document]
    const { data: updated, error } = await q.updatePatientDocuments(patientId, nextDocs)
    if (error) throw new Error('Document metadata update failed')
    const savedDocs = readPatientDocuments(updated?.documents)
    if (savedDocs.length !== nextDocs.length || !savedDocs.some((doc) => doc.path === upload.path)) {
      throw new Error('Document metadata verification failed')
    }
    const { error: auditError } = await q.insertAuditLog({
      agency_id: row.agency_id,
      table_name: 'patients', record_id: patientId, action: 'UPDATE',
      performed_by_user_id: session.user.id,
      details: { field: 'documents', added: 1, total: savedDocs.length },
    })
    if (auditError) throw new Error('Document audit failed')
    return savedDocs
  }).catch(() => null)
  if (!result) return { error: 'Could not save document metadata', data: null }

  revalidatePatientPages(patientId)
  return { error: null, data: result }
}

/** Remove a single patient document from storage and persist the updated document list. */
export async function deletePatientDocumentAction(
  patientId: string,
  docPath: string
): Promise<{ error: string | null; data?: PatientDocument[] }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null

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

    const currentDocs = readPatientDocuments(row.documents)
    if (!currentDocs.some((doc) => doc.path === docPath)) {
      return { error: 'Document not found' }
    }

    const nextDocs = currentDocs.filter((doc) => doc.path !== docPath)
    const { data: updated, error } = await q.updatePatientDocuments(patientId, nextDocs)
    if (error) return { error: error.message }
    const savedDocs = readPatientDocuments(updated?.documents)
    if (savedDocs.length !== nextDocs.length || savedDocs.some((doc) => doc.path === docPath)) {
      throw new Error('Document list was not saved')
    }
    return { error: null, agencyId: row.agency_id, remaining: savedDocs.length, data: savedDocs }
  }).catch(() => ({
    error: 'Could not save document metadata',
    agencyId: undefined,
    remaining: undefined,
    data: undefined,
  }))
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
  if (auditErr) console.error('[patient-documents/delete] Audit log failed')

  revalidatePatientPages(patientId)
  return { error: null, data: updateResult.data }
}
