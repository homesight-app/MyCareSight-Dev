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

function storedFileDownloadUrl(bucket: StorageBucket, path: string): string {
  return `/api/storage/download?${new URLSearchParams({ bucket, path }).toString()}`
}

/** Fetch authorized bytes through the app, so browser downloads do not depend on blob CORS. */
export async function fetchStoredFile(bucket: StorageBucket, path: string): Promise<Blob> {
  if (!path) throw new Error('Invalid document request')
  const response = await fetch(storedFileDownloadUrl(bucket, path), { cache: 'no-store' })
  if (!response.ok) throw new Error(await responseError(response, 'Failed to download document'))
  return response.blob()
}

/**
 * Starts a same-origin, server-authorized download. The server chooses the
 * filename from the document record and returns it in Content-Disposition.
 */
export function downloadStoredFile(bucket: StorageBucket, path: string): void {
  if (!path) return

  const anchor = document.createElement('a')
  anchor.href = storedFileDownloadUrl(bucket, path)
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
