'use server'

import { revalidatePath } from 'next/cache'
import { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import {
  createApplicationDocumentsSchema,
  replaceApplicationDocumentSchema,
} from '@/lib/schemas/application-documents'
import { STORAGE_BUCKET } from '@/lib/storage'
import { auditStoredObjectAccess } from '@/lib/storage/authorization'
import { removeFiles } from '@/lib/storage/client'
import { readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import type { StoredFileUpload } from '@/lib/storage/contracts'
import * as q from '@/lib/supabase/query'
import { zodErrorToFieldErrors } from '@/lib/validation'

type InsertedDocument = { id: string; document_url: string; document_name: string }

type ActionResult<T = null> =
  | { success: true; data: T; error?: never; fieldErrors?: never }
  | {
      success: false
      data: null
      error: string
      fieldErrors?: Record<string, string[]>
      cleanupRequired?: boolean
    }

type VerifiedUpload = StoredFileUpload & {
  agencyId: string | null
  recordId: string
  tableName: string
}

function revalidateApplicationPages(applicationId: string) {
  revalidatePath(`/pages/admin/programs/${applicationId}`)
  revalidatePath(`/pages/expert/programs/${applicationId}`)
  revalidatePath(`/pages/agency/programs/${applicationId}`)
}

function verifyUpload(
  upload: StoredFileUpload,
  actorId: string,
  applicationId: string
): VerifiedUpload | null {
  const claim = readStorageCleanupToken(upload.cleanupToken)
  if (
    !claim
    || claim.actorId !== actorId
    || claim.bucket !== STORAGE_BUCKET.APPLICATION
    || claim.path !== upload.path
    || claim.recordId !== applicationId
    || claim.tableName !== 'applications'
  ) return null

  return {
    path: upload.path,
    cleanupToken: upload.cleanupToken,
    agencyId: claim.agencyId,
    recordId: claim.recordId,
    tableName: claim.tableName,
  }
}

async function cleanupVerifiedUploads(actorId: string, uploads: VerifiedUpload[]) {
  if (!uploads.length) return true
  const { error } = await removeFiles(STORAGE_BUCKET.APPLICATION, uploads.map(upload => upload.path))
  if (error) return false

  await Promise.allSettled(uploads.map(upload => auditStoredObjectAccess(actorId, upload, 'DELETE')))
  return true
}

/**
 * Commit one or more previously authorized application uploads to the database.
 * Files are uploaded through /api/storage/upload so the Server Action receives
 * only small, signed metadata and is not constrained by the Server Action body limit.
 */
export async function uploadApplicationDocumentsAction(input: unknown): Promise<ActionResult<InsertedDocument[]>> {
  const parsed = createApplicationDocumentsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: 'Check the highlighted fields',
      fieldErrors: zodErrorToFieldErrors(parsed.error),
      cleanupRequired: true,
    }
  }

  const session = await getSession()
  if (!session?.user) return { success: false, data: null, error: 'Not authenticated' }

  const { applicationId, uploads } = parsed.data
  const verifiedUploads = uploads.map(upload => verifyUpload(upload, session.user.id, applicationId))
  if (verifiedUploads.some(upload => !upload)) {
    return {
      success: false,
      data: null,
      error: 'The uploaded file authorization is invalid or expired',
      cleanupRequired: true,
    }
  }
  const verified = verifiedUploads as VerifiedUpload[]
  if (new Set(verified.map(upload => upload.path)).size !== verified.length) {
    return {
      success: false,
      data: null,
      error: 'Duplicate uploaded files are not allowed',
      cleanupRequired: true,
    }
  }

  try {
    const inserted = await withUserContext(
      session.user.id,
      session.profile.role ?? '',
      session.profile.agency_id ?? null,
      async () => {
        const { data: application, error: applicationError } = await q.getApplicationById(applicationId)
        if (applicationError || !application) throw new Error('APPLICATION_NOT_FOUND')

        if (parsed.data.applicationPlaybookItemId) {
          const { data: item, error: itemError } = await q.getApplicationPlaybookItemById(
            parsed.data.applicationPlaybookItemId,
            applicationId
          )
          if (itemError || !item) throw new Error('PLAYBOOK_ITEM_NOT_FOUND')
        }

        const rows: InsertedDocument[] = []
        for (const upload of uploads) {
          const insertData: Record<string, unknown> = {
            application_id: applicationId,
            document_name: upload.documentName,
            document_url: upload.path,
            document_type: parsed.data.documentType ?? null,
            description: parsed.data.description?.trim() || null,
            status: parsed.data.status,
          }
          if (parsed.data.licenseRequirementDocumentId) {
            insertData.license_requirement_document_id = parsed.data.licenseRequirementDocumentId
          }
          if (parsed.data.applicationPlaybookItemId) {
            insertData.application_playbook_item_id = parsed.data.applicationPlaybookItemId
          }

          const { data: document, error: insertError } = await q.insertApplicationDocument(insertData)
          if (insertError || !document) throw new Error('DOCUMENT_INSERT_FAILED')

          const { error: auditError } = await q.insertAuditLog({
            agency_id: (application as { agency_id?: string | null }).agency_id ?? null,
            table_name: 'application_documents',
            record_id: document.id,
            action: 'CREATE',
            performed_by_user_id: session.user.id,
            details: { application_id: applicationId },
          })
          if (auditError) throw new Error('AUDIT_INSERT_FAILED')

          rows.push({
            id: document.id,
            document_url: upload.path,
            document_name: document.document_name,
          })
        }
        return rows
      }
    )

    revalidateApplicationPages(applicationId)
    return { success: true, data: inserted }
  } catch {
    const cleaned = await cleanupVerifiedUploads(session.user.id, verified)
    console.error('[application-documents/create] Database commit failed')
    return {
      success: false,
      data: null,
      error: 'The document could not be saved. Please try again.',
      cleanupRequired: !cleaned,
    }
  }
}

/** Replace the stored object and metadata of an existing application document. */
export async function replaceApplicationDocumentAction(input: unknown): Promise<ActionResult> {
  const parsed = replaceApplicationDocumentSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: 'Check the highlighted fields',
      fieldErrors: zodErrorToFieldErrors(parsed.error),
      cleanupRequired: true,
    }
  }

  const session = await getSession()
  if (!session?.user) return { success: false, data: null, error: 'Not authenticated' }

  const { documentId, applicationId, upload } = parsed.data
  const verified = verifyUpload(upload, session.user.id, applicationId)
  if (!verified) {
    return {
      success: false,
      data: null,
      error: 'The uploaded file authorization is invalid or expired',
      cleanupRequired: true,
    }
  }

  let oldPath: string | null = null
  let applicationAgencyId: string | null = null
  try {
    await withUserContext(
      session.user.id,
      session.profile.role ?? '',
      session.profile.agency_id ?? null,
      async () => {
        const { data: application, error: applicationError } = await q.getApplicationById(applicationId)
        if (applicationError || !application) throw new Error('APPLICATION_NOT_FOUND')
        applicationAgencyId = (application as { agency_id?: string | null }).agency_id ?? null

        const { data: document, error: documentError } = await q.getApplicationDocumentForUpdate(
          documentId,
          applicationId
        )
        if (documentError || !document) throw new Error('DOCUMENT_NOT_FOUND')
        oldPath = document.document_url

        const { error: updateError } = await q.updateApplicationDocumentFile(documentId, applicationId, {
          document_url: upload.path,
          document_name: parsed.data.documentName,
          document_type: parsed.data.documentType,
          description: parsed.data.description,
        })
        if (updateError) throw new Error('DOCUMENT_UPDATE_FAILED')

        const { error: auditError } = await q.insertAuditLog({
          agency_id: applicationAgencyId,
          table_name: 'application_documents',
          record_id: documentId,
          action: 'UPDATE',
          performed_by_user_id: session.user.id,
          details: { application_id: applicationId, field: 'file' },
        })
        if (auditError) throw new Error('AUDIT_INSERT_FAILED')
      }
    )
  } catch {
    const cleaned = await cleanupVerifiedUploads(session.user.id, [verified])
    console.error('[application-documents/replace] Database commit failed')
    return {
      success: false,
      data: null,
      error: 'The document could not be replaced. Please try again.',
      cleanupRequired: !cleaned,
    }
  }

  if (oldPath && oldPath !== upload.path) {
    const { error: deleteError } = await removeFiles(STORAGE_BUCKET.APPLICATION, [oldPath])
    if (!deleteError) {
      await auditStoredObjectAccess(session.user.id, {
        agencyId: applicationAgencyId,
        recordId: documentId,
        tableName: 'application_documents',
      }, 'DELETE').catch(() => undefined)
    }
  }

  revalidateApplicationPages(applicationId)
  return { success: true, data: null }
}
