'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'
import { uploadFile, removeFiles } from '@/lib/storage/client'

function revalidateLicensePages(agencyId: string | null) {
  if (agencyId) {
    revalidatePath(`/pages/admin/agencies/${agencyId}`)
    revalidatePath(`/pages/expert/agencies/${agencyId}`)
    revalidatePath(`/pages/agency/certifications`)
  }
  revalidatePath('/pages/admin/licenses')
  revalidatePath('/pages/agency/certifications')
}

/**
 * Upload a single license document and insert the license_documents row.
 * Used in CertificationDetailModal (add doc to existing license) and CreateLicenseModal
 * edit/owner modes (add doc to a just-created or existing license).
 */
export async function uploadLicenseDocumentAction(
  licenseId: string,
  agencyId: string | null,
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const file = formData.get('file') as File | null
  const documentName = formData.get('document_name') as string | null
  const documentType = formData.get('document_type') as string | null

  if (!file) return { error: 'File is required' }

  const fileExt = file.name.split('.').pop()
  const filePath = `license-${licenseId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

  const { error: uploadErr } = await uploadFile(supabase, STORAGE_BUCKET.APPLICATION, filePath, file, {
    upsert: false,
    contentType: file.type || `application/${fileExt}`,
  })
  if (uploadErr) return { error: uploadErr.message }

  const { error: docErr } = await q.insertLicenseDocument(supabase, {
    license_id: licenseId,
    document_name: (documentName?.trim() || file.name),
    document_url: filePath,
    document_type: documentType || null,
  })
  if (docErr) {
    await removeFiles(supabase, STORAGE_BUCKET.APPLICATION, [filePath])
    return { error: docErr.message }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: agencyId,
    table_name: 'license_documents',
    record_id: licenseId,
    action: 'CREATE',
    performed_by_user_id: user.id,
    details: { license_id: licenseId, document_name: documentName?.trim() || file.name, document_url: filePath },
  })
  if (auditErr) console.error('[license-documents/upload] Audit log failed. licenseId=%s err=%s', licenseId, auditErr.message)

  revalidateLicensePages(agencyId)
  return { error: null }
}

/**
 * Upload one or more license document files to storage and return the stored paths.
 * Does NOT insert license_documents rows — caller passes the returned URLs to
 * createLicenseForAgency / createCertificationAndLink which perform the inserts.
 *
 * FormData fields: 'file' (repeatable), 'name' (repeatable, parallel with file), 'type' (repeatable)
 */
export async function uploadLicenseDocumentsForCreationAction(
  agencyId: string,
  formData: FormData
): Promise<{ error: string | null; data: { url: string; name: string; type: string | null }[] | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', data: null }

  const files = formData.getAll('file') as File[]
  const names = formData.getAll('name') as string[]
  const types = formData.getAll('type') as string[]

  if (files.length === 0) return { error: null, data: [] }

  const uploadedPaths: string[] = []
  const result: { url: string; name: string; type: string | null }[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileExt = file.name.split('.').pop()
    const filePath = `agency-${agencyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error: uploadErr } = await uploadFile(supabase, STORAGE_BUCKET.APPLICATION, filePath, file, {
      upsert: false,
      contentType: file.type || `application/${fileExt}`,
      cacheControl: '3600',
    })
    if (uploadErr) {
      await removeFiles(supabase, STORAGE_BUCKET.APPLICATION, uploadedPaths)
      return { error: uploadErr.message, data: null }
    }
    uploadedPaths.push(filePath)
    result.push({
      url: filePath,
      name: names[i]?.trim() || file.name,
      type: types[i] || null,
    })
  }

  return { error: null, data: result }
}

/** Remove files from the application-documents storage bucket (cleanup on creation failure). */
export async function removeUploadedLicenseFilesAction(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const supabase = await createClient()
  const { error } = await removeFiles(supabase, STORAGE_BUCKET.APPLICATION, paths)
  if (error) console.error('[license-documents/cleanup] Storage removal failed. paths=%j err=%s', paths, error.message)
}
