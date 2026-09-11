import { auth } from '@/auth'
import { uploadFile, removeFiles } from '@/lib/storage/client'

const ALLOWED_BUCKETS = new Set([
  'application-documents',
  'patient-documents',
  'staff-member-documents',
  'lead-documents',
  'agency-documents',
  'agency-public',
  'license-templates',
])

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  const bucket = (form.get('bucket') as string) ?? ''
  const path = (form.get('path') as string) ?? ''

  if (!file || !ALLOWED_BUCKETS.has(bucket) || !path) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { path: stored, error } = await uploadFile(bucket, path, file, { contentType: file.type })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ path: stored })
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { bucket, paths } = await request.json()

  if (!ALLOWED_BUCKETS.has(bucket) || !Array.isArray(paths) || paths.length === 0) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { error } = await removeFiles(bucket, paths)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
