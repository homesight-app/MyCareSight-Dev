import type { StoredFileUpload, UploadPurpose } from './contracts'

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null
  return body?.error || fallback
}

export async function uploadStoredFile(
  file: File,
  purpose: UploadPurpose,
  resourceId?: string
): Promise<StoredFileUpload> {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', purpose)
  if (resourceId) form.append('resourceId', resourceId)

  const response = await fetch('/api/storage/upload', { method: 'POST', body: form })
  if (!response.ok) throw new Error(await responseError(response, 'Failed to upload file'))
  return response.json() as Promise<StoredFileUpload>
}

export async function cleanupStoredFile(upload: StoredFileUpload): Promise<void> {
  try {
    await fetch('/api/storage/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upload),
    })
  } catch {
    // Cleanup is best-effort; the upload remains auditable for operational repair.
  }
}
