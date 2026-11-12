import { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { attachmentContentDisposition } from '@/lib/download-filename'
import { auditStoredObjectAccess, authorizeStoredObject } from '@/lib/storage/authorization'
import { downloadFile } from '@/lib/storage/client'
import { STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

export const runtime = 'nodejs'

export async function GET(request: Request) {
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

    const file = await downloadFile(bucket, path, STORAGE_UPLOAD_MAX_BYTES)
    if (!file) return Response.json({ error: 'Unable to download document' }, { status: 503 })

    await withUserContext(...context, () =>
      auditStoredObjectAccess(session.user.id, object, 'DOWNLOAD')
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
