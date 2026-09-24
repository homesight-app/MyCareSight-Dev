'use server'

import { revalidatePath } from 'next/cache'
import { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { STORAGE_BUCKET } from '@/lib/storage'
import { uploadFile, removeFiles } from '@/lib/storage/client'

function revalidateApplicationPages(applicationId: string) {
  revalidatePath(`/pages/admin/programs/${applicationId}`)
  revalidatePath(`/pages/expert/programs/${applicationId}`)
  revalidatePath(`/pages/agency/programs/${applicationId}`)
}

/**
 * Upload one or more documents for an application. Accepts files via FormData fields:
 *   file (repeatable), document_type, description
 * Each file's browser name is used as document_name.
 */
export async function uploadApplicationDocumentsAction(
  applicationId: string,
  formData: FormData,
  options?: {
    status?: 'draft' | 'approved' | 'pending'
    licenseRequirementDocumentId?: string | null
    applicationPlaybookItemId?: string | null
  }
): Promise<{ error: string | null; data: { id: string; document_url: string; document_name: string }[] | null }> {
  const session = await getSession()
  if (!session?.user) return { error: 'Not authenticated', data: null }

  const files = formData.getAll('file') as File[]
  const documentType = formData.get('document_type') as string | null
  const description = formData.get('description') as string | null

  if (files.length === 0) return { error: 'No files provided', data: null }

  const uploadedPaths: string[] = []
  const inserted: { id: string; document_url: string; document_name: string }[] = []

  for (const file of files) {
    const fileExt = file.name.split('.').pop()
    const filePath = `${applicationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error: uploadErr } = await uploadFile(STORAGE_BUCKET.APPLICATION, filePath, file)
    if (uploadErr) {
      await removeFiles(STORAGE_BUCKET.APPLICATION, uploadedPaths)
      return { error: uploadErr.message, data: null }
    }
    uploadedPaths.push(filePath)

    const insertData: Record<string, unknown> = {
      application_id: applicationId,
      document_name: file.name,
      document_url: filePath,
      document_type: documentType || null,
      description: description?.trim() || null,
      status: options?.status ?? 'draft',
    }
    if (options?.licenseRequirementDocumentId) {
      insertData.license_requirement_document_id = options.licenseRequirementDocumentId
    }
    if (options?.applicationPlaybookItemId) {
      insertData.application_playbook_item_id = options.applicationPlaybookItemId
    }

    const { data: doc, error: insertErr } = await q.insertApplicationDocument(insertData)
    if (insertErr) {
      await removeFiles(STORAGE_BUCKET.APPLICATION, uploadedPaths)
      return { error: insertErr.message, data: null }
    }

    inserted.push({ id: doc!.id, document_url: filePath, document_name: doc!.document_name })

    try {
      await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
        const { data: appRow } = await q.getApplicationById(applicationId)
        const agencyId = (appRow as unknown as { agency_id?: string | null } | null)?.agency_id ?? null
        const { error: auditErr } = await q.insertAuditLog({
          agency_id: agencyId,
          table_name: 'application_documents',
          record_id: doc!.id,
          action: 'CREATE',
          performed_by_user_id: session.user.id,
          details: { application_id: applicationId, document_name: doc!.document_name },
        })
        if (auditErr) console.error('[application-documents/upload] Audit log failed. docId=%s err=%s', doc!.id, auditErr.message)
      })
    } catch (err) {
      console.error('[application-documents/uploadApplicationDocumentsAction] audit context failed', err)
    }
  }

  revalidateApplicationPages(applicationId)
  return { error: null, data: inserted }
}

/** Replace the file of an existing application_document row. */
export async function replaceApplicationDocumentAction(
  docId: string,
  applicationId: string,
  formData: FormData,
  docMeta: { document_name: string; document_type: string | null; description: string | null }
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session?.user) return { error: 'Not authenticated' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'File is required' }

  const fileExt = file.name.split('.').pop()
  const filePath = `${applicationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

  const { error: uploadErr } = await uploadFile(STORAGE_BUCKET.APPLICATION, filePath, file)
  if (uploadErr) return { error: uploadErr.message }

  const { error: updateErr } = await q.updateApplicationDocumentFile(docId, applicationId, {
    document_url: filePath,
    document_name: docMeta.document_name,
    document_type: docMeta.document_type,
    description: docMeta.description,
  })
  if (updateErr) {
    await removeFiles(STORAGE_BUCKET.APPLICATION, [filePath])
    return { error: updateErr.message }
  }

  try {
    await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
      const { data: appRow } = await q.getApplicationById(applicationId)
      const agencyId = (appRow as unknown as { agency_id?: string | null } | null)?.agency_id ?? null
      const { error: auditErr } = await q.insertAuditLog({
        agency_id: agencyId,
        table_name: 'application_documents',
        record_id: docId,
        action: 'UPDATE',
        performed_by_user_id: session.user.id,
        details: { application_id: applicationId, field: 'file', new_path: filePath },
      })
      if (auditErr) console.error('[application-documents/replace] Audit log failed. docId=%s err=%s', docId, auditErr.message)
    })
  } catch (err) {
    console.error('[application-documents/replaceApplicationDocumentAction] audit context failed', err)
  }

  revalidateApplicationPages(applicationId)
  return { error: null }
}
