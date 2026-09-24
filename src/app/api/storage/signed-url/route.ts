import { getSession } from '@/lib/auth'
import { auditStoredObjectAccess, authorizeStoredObject } from '@/lib/storage/authorization'
import { getSignedUrl } from '@/lib/storage/client'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket') ?? ''
  const path = searchParams.get('path') ?? ''
  const requestedExpiry = Number(searchParams.get('expiresIn') ?? 600)
  const expiresIn = Number.isFinite(requestedExpiry)
    ? Math.min(900, Math.max(60, Math.floor(requestedExpiry)))
    : 600

  if (!bucket || !path) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const object = await authorizeStoredObject(bucket, path)
    if (!object) return Response.json({ error: 'Document not found' }, { status: 404 })

    const url = await getSignedUrl(bucket, path, expiresIn)
    if (!url) return Response.json({ error: 'Unable to issue document URL' }, { status: 503 })
    await auditStoredObjectAccess(session.user.id, object, 'SIGNED_URL')
    return Response.json({ url })
  } catch {
    return Response.json({ error: 'Unable to issue document URL' }, { status: 500 })
  }
}
