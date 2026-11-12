import type { StorageBucket, StoredFileUpload, UploadPurpose } from './contracts'

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null
  if (body?.error) return body.error
  if (response.status === 413) return 'The upload was rejected because the request was too large'
  return `${fallback} (HTTP ${response.status})`
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

/**
 * Starts a same-origin, server-authorized download. The server chooses the
 * filename from the document record and returns it in Content-Disposition.
 */
export function downloadStoredFile(bucket: StorageBucket, path: string): void {
  if (!path) return

  const query = new URLSearchParams({ bucket, path })
  const anchor = document.createElement('a')
  anchor.href = `/api/storage/download?${query.toString()}`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
