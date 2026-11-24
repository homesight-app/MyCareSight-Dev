import { randomUUID } from 'crypto'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import { uploadFile, removeFiles } from '@/lib/storage/client'
import { auditStoredObjectAccess, authorizeStorageUpload } from '@/lib/storage/authorization'
import { createStorageCleanupToken, readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import { reportUploadFailure } from '@/lib/storage/diagnostics'
import { STORAGE_UPLOAD_FILE_EXTENSIONS, STORAGE_UPLOAD_MAX_BYTES, type UploadPurpose } from '@/lib/storage/contracts'
import { STORAGE_BUCKET } from '@/lib/storage/contracts'
import { findAgencyDocumentUpload, lockAgencyDocumentUpload } from '@/lib/repositories/agency-documents'

const MAX_MULTIPART_REQUEST_BYTES = STORAGE_UPLOAD_MAX_BYTES + 256 * 1024
const PURPOSES = new Set<UploadPurpose>([
  'application-document',
  'lead-document',
  'agency-document',
  'patient-document',
  'caregiver-certification',
  'license-document',
  'license-requirement-template',
  'patient-incident',
  'playbook-template',
])

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_REQUEST_BYTES) {
    return Response.json({ error: 'Files must be 10 MB or smaller' }, { status: 413 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ error: 'The upload request could not be read' }, { status: 400 })
  const file = form.get('file')
  const purpose = form.get('purpose')
  const resourceId = form.get('resourceId')
  if (
    !(file instanceof File)
    || typeof purpose !== 'string'
    || !PURPOSES.has(purpose as UploadPurpose)
    || (resourceId !== null && typeof resourceId !== 'string')
    || file.size < 1
    || file.size > STORAGE_UPLOAD_MAX_BYTES
  ) {
    return Response.json({ error: 'Invalid upload request' }, { status: 400 })
  }

  const mime = file.type.toLowerCase()
  const extension = Object.prototype.hasOwnProperty.call(STORAGE_UPLOAD_FILE_EXTENSIONS, mime)
    ? STORAGE_UPLOAD_FILE_EXTENSIONS[mime] : undefined
  if (!extension) return Response.json({ error: 'Unsupported file type' }, { status: 400 })

  const authorized = await withUserContext(
    session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null,
    () => authorizeStorageUpload(
      purpose as UploadPurpose,
      typeof resourceId === 'string' && resourceId ? resourceId : null
    )
  )
  if (!authorized) return Response.json({ error: 'Not found' }, { status: 404 })

  const path = `${authorized.pathPrefix}${randomUUID()}.${extension}`
  const { error } = await uploadFile(authorized.bucket, path, file, { contentType: file.type })
  if (error) {
    reportUploadFailure('object-upload', error)
    return Response.json({ error: 'File upload failed' }, { status: 500 })
  }

  try {
    await withUserContext(
      session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null,
      () => auditStoredObjectAccess(session.user.id, authorized, 'UPLOAD')
    )
  } catch (error) {
    reportUploadFailure('upload-audit', error)
    await removeFiles(authorized.bucket, [path])
    return Response.json({ error: 'File upload could not be recorded' }, { status: 500 })
  }

  const cleanupToken = createStorageCleanupToken({
    actorId: session.user.id,
    bucket: authorized.bucket,
    path,
    agencyId: authorized.agencyId,
    recordId: authorized.recordId,
    tableName: authorized.tableName,
  })
  return Response.json({ path, cleanupToken })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { path?: unknown; cleanupToken?: unknown } | null
  if (typeof body?.path !== 'string' || typeof body.cleanupToken !== 'string') {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const claim = readStorageCleanupToken(body.cleanupToken)
  if (!claim || claim.actorId !== session.user.id || claim.path !== body.path) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (claim.bucket === STORAGE_BUCKET.AGENCY) {
    if (!claim.agencyId || claim.tableName !== 'agencies' || claim.recordId !== claim.agencyId
      || !claim.path.startsWith(`${claim.agencyId}/`)) return Response.json({ error: 'Not found' }, { status: 404 })
    const agencyId = claim.agencyId
    try {
      return await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
        const authorized = await authorizeStorageUpload('agency-document', agencyId)
        if (!authorized || authorized.agencyId !== agencyId) return Response.json({ error: 'Not found' }, { status: 404 })
        await lockAgencyDocumentUpload(claim.path)
        if (await findAgencyDocumentUpload(agencyId, claim.path)) {
          return Response.json({ error: 'This file is already attached to a saved document' }, { status: 409 })
        }
        const { error } = await removeFiles(claim.bucket, [claim.path])
        if (error) throw error
        await auditStoredObjectAccess(session.user.id, claim, 'DELETE')
        return Response.json({ success: true })
      })
    } catch (error) {
      reportUploadFailure('upload-cleanup', error)
      return Response.json({ error: 'File cleanup failed' }, { status: 500 })
    }
  }

  const { error } = await removeFiles(claim.bucket, [claim.path])
  if (error) return Response.json({ error: 'File cleanup failed' }, { status: 500 })
  await withUserContext(
    session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null,
    () => auditStoredObjectAccess(session.user.id, claim, 'DELETE')
  )
  return Response.json({ success: true })
}
