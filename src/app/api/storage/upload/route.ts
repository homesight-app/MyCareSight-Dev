import { randomUUID } from 'crypto'
import { getSession } from '@/lib/auth'
import { uploadFile, removeFiles } from '@/lib/storage/client'
import { auditStoredObjectAccess, authorizeStorageUpload } from '@/lib/storage/authorization'
import { createStorageCleanupToken, readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import type { UploadPurpose } from '@/lib/storage/contracts'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const PURPOSES = new Set<UploadPurpose>([
  'application-document',
  'caregiver-certification',
  'license-document',
  'license-requirement-template',
  'patient-incident',
  'playbook-template',
])
const FILE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  const purpose = form.get('purpose')
  const resourceId = form.get('resourceId')
  if (
    !(file instanceof File)
    || typeof purpose !== 'string'
    || !PURPOSES.has(purpose as UploadPurpose)
    || (resourceId !== null && typeof resourceId !== 'string')
    || file.size < 1
    || file.size > MAX_FILE_SIZE
  ) {
    return Response.json({ error: 'Invalid upload request' }, { status: 400 })
  }

  const extension = FILE_EXTENSIONS[file.type.toLowerCase()]
  if (!extension) return Response.json({ error: 'Unsupported file type' }, { status: 400 })

  const authorized = await authorizeStorageUpload(
    purpose as UploadPurpose,
    typeof resourceId === 'string' && resourceId ? resourceId : null
  )
  if (!authorized) return Response.json({ error: 'Not found' }, { status: 404 })

  const path = `${authorized.pathPrefix}${randomUUID()}.${extension}`
  const { error } = await uploadFile(authorized.bucket, path, file, { contentType: file.type })
  if (error) return Response.json({ error: 'File upload failed' }, { status: 500 })

  try {
    await auditStoredObjectAccess(session.user.id, authorized, 'UPLOAD')
  } catch {
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

  const { error } = await removeFiles(claim.bucket, [claim.path])
  if (error) return Response.json({ error: 'File cleanup failed' }, { status: 500 })
  await auditStoredObjectAccess(session.user.id, claim, 'DELETE')
  return Response.json({ success: true })
}
