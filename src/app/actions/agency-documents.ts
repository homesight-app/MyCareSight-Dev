'use server'

import { revalidatePath } from 'next/cache'
import { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { authorizeStorageUpload } from '@/lib/storage/authorization'
import { readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import { reportAgencyUploadFailure, type AgencyUploadStage } from '@/lib/storage/diagnostics'
import { STORAGE_BUCKET } from '@/lib/storage/contracts'
import { commitAgencyDocumentSchema } from '@/lib/schemas/agency-documents'
import { zodErrorToFieldErrors } from '@/lib/validation'
import { findAgencyDocumentUpload, lockAgencyDocumentUpload } from '@/lib/repositories/agency-documents'
import { getFileMetadata } from '@/lib/storage/client'
import { STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

type Result = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  cleanupRequired?: boolean
  doc?: { id: string; document_name: string; file_url: string; file_name: string; document_type: string | null; created_at: string }
}

/** Binary data goes through /api/storage/upload; this action receives only small signed metadata. */
export async function commitAgencyDocumentUploadAction(input: unknown): Promise<Result> {
  const parsed = commitAgencyDocumentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Check the highlighted fields.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  let stage: AgencyUploadStage = 'authentication'
  let commitAttempted = false
  let alreadySaved = false
  try {
    const session = await getSession()
    if (!session) return { success: false, error: 'Your session has expired. Sign in again before uploading.' }
    const { agencyId, upload, documentName, documentType, originalFileName } = parsed.data
    stage = 'upload-proof'
    const claim = readStorageCleanupToken(upload.cleanupToken)
    if (!claim || claim.actorId !== session.user.id || claim.bucket !== STORAGE_BUCKET.AGENCY
      || claim.tableName !== 'agencies' || claim.agencyId !== agencyId || claim.recordId !== agencyId
      || claim.path !== upload.path || !claim.path.startsWith(`${agencyId}/`)) {
      return { success: false, error: 'The uploaded file authorization is invalid or expired. Choose the file again.' }
    }
    const doc = await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
      stage = 'agency-authorization'
      const authorized = await authorizeStorageUpload('agency-document', agencyId)
      if (!authorized || authorized.agencyId !== agencyId) throw new Error('Upload denied')
      stage = 'upload-lock'
      await lockAgencyDocumentUpload(upload.path)
      const existing = await findAgencyDocumentUpload(agencyId, upload.path)
      if (existing) {
        alreadySaved = true
        stage = 'audit'
        const { error } = await q.insertAuditLog({ agency_id: agencyId, table_name: 'agency_documents',
          record_id: existing.id, action: 'READ', performed_by_user_id: session.user.id,
          details: { operation: 'upload_confirmation' } })
        if (error) throw new Error('Confirmation audit failed')
        commitAttempted = true
        stage = 'database-commit'
        return { ...existing, file_name: existing.file_name ?? originalFileName }
      }
      stage = 'object-verification'
      const metadata = await getFileMetadata(STORAGE_BUCKET.AGENCY, upload.path, STORAGE_UPLOAD_MAX_BYTES)
      if (!metadata || metadata.contentLength !== parsed.data.size) throw new Error('Uploaded object verification failed')
      stage = 'metadata-save'
      const { data, error } = await q.insertAgencyDocument({
        agency_id: agencyId, document_name: documentName, file_url: upload.path,
        file_name: originalFileName, document_type: documentType || null, uploaded_by: session.user.id,
      })
      if (error || !data?.id) throw new Error('Metadata save failed')
      stage = 'audit'
      const { error: auditError } = await q.insertAuditLog({
        agency_id: agencyId, table_name: 'agency_documents', record_id: data.id, action: 'CREATE',
        performed_by_user_id: session.user.id, details: { operation: 'upload' },
      })
      if (auditError) throw new Error('Audit failed')
      commitAttempted = true
      stage = 'database-commit'
      return { id: data.id as string, document_name: documentName, file_url: upload.path,
        file_name: originalFileName, document_type: documentType || null, created_at: new Date().toISOString() }
    })
    try {
      for (const path of [`/pages/admin/agencies/${agencyId}`, `/pages/expert/agencies/${agencyId}`, '/pages/agency/profile']) revalidatePath(path)
    } catch { reportAgencyUploadFailure('cache-invalidation') }
    return { success: true, doc }
  } catch {
    reportAgencyUploadFailure(stage)
    return {
      success: false,
      error: commitAttempted || alreadySaved ? 'Upload result is uncertain. Refresh the document list before trying again.' : 'The document could not be saved. Please try again.',
      cleanupRequired: !commitAttempted && !alreadySaved && ['agency-authorization', 'metadata-save', 'audit'].includes(stage),
    }
  }
}
