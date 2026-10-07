import { getSession } from '@/lib/auth'
import { auditStoredObjectAccess, authorizeStoredObject } from '@/lib/storage/authorization'
import { downloadFile } from '@/lib/storage/client'
import { STORAGE_BUCKET, STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

export const runtime = 'nodejs'

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function isDocxPath(path: string) {
  try {
    const pathname = /^https?:\/\//i.test(path) ? new URL(path).pathname : path.split(/[?#]/, 1)[0]
    return decodeURIComponent(pathname).toLowerCase().endsWith('.docx')
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const path = new URL(request.url).searchParams.get('path') ?? ''
  if (!isDocxPath(path)) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const object = await authorizeStoredObject(STORAGE_BUCKET.APPLICATION, path)
    if (!object) return Response.json({ error: 'Document not found' }, { status: 404 })

    const file = await downloadFile(STORAGE_BUCKET.APPLICATION, path, STORAGE_UPLOAD_MAX_BYTES)
    if (!file) return Response.json({ error: 'Unable to load document' }, { status: 503 })
    const contentType = file.contentType?.split(';', 1)[0].trim().toLowerCase()
    if (contentType && contentType !== DOCX_CONTENT_TYPE) {
      return Response.json({ error: 'Unsupported document type' }, { status: 415 })
    }

    await auditStoredObjectAccess(session.user.id, object, 'DOWNLOAD')
    return new Response(file.stream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'Content-Length': String(file.contentLength),
        'Content-Type': DOCX_CONTENT_TYPE,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return Response.json({ error: 'Unable to load document' }, { status: 500 })
  }
}
