import { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { attachmentContentDisposition } from '@/lib/download-filename'
import { auditStoredObjectAccess, authorizeStoredObject } from '@/lib/storage/authorization'
import { downloadFile, getFileMetadata } from '@/lib/storage/client'
import { STORAGE_DOWNLOAD_MAX_BYTES } from '@/lib/storage/contracts'

export const runtime = 'nodejs'

async function handleRequest(request: Request, metadataOnly: boolean) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket') ?? ''
  const path = searchParams.get('path') ?? ''

  if (!bucket || !path) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const context = [
      session.user.id,
      session.profile?.role ?? '',
      session.profile?.agency_id ?? null,
    ] as const
    const object = await withUserContext(...context, () => authorizeStoredObject(bucket, path))
    if (!object) return Response.json({ error: 'Document not found' }, { status: 404 })

    const file = metadataOnly
      ? await getFileMetadata(bucket, path, STORAGE_DOWNLOAD_MAX_BYTES).then(metadata => metadata && { ...metadata, stream: null })
      : await downloadFile(bucket, path, STORAGE_DOWNLOAD_MAX_BYTES)
    if (!file) return Response.json({ error: 'Unable to download document' }, { status: 503 })

    await withUserContext(...context, () =>
      auditStoredObjectAccess(session.user.id, object, metadataOnly ? 'METADATA' : 'DOWNLOAD')
    )

    return new Response(file.stream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': attachmentContentDisposition(object.downloadFileName ?? 'document'),
        'Content-Length': String(file.contentLength),
        'Content-Type': file.contentType ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return Response.json({ error: 'Unable to download document' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handleRequest(request, false)
}

export async function HEAD(request: Request) {
  const response = await handleRequest(request, true)
  return new Response(null, { status: response.status, headers: response.headers })
}
