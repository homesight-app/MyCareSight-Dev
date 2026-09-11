import { auth } from '@/auth'
import { getSignedUrl } from '@/lib/storage/client'

const ALLOWED_BUCKETS = new Set([
  'application-documents',
  'patient-documents',
  'staff-member-documents',
  'lead-documents',
  'agency-documents',
  'agency-public',
  'license-templates',
])

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket') ?? ''
  const path = searchParams.get('path') ?? ''
  const expiresIn = Number(searchParams.get('expiresIn') ?? 3600)

  if (!ALLOWED_BUCKETS.has(bucket) || !path) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const url = await getSignedUrl(bucket, path, expiresIn)
  return Response.json({ url })
}
