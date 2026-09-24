export { STORAGE_BUCKET } from './contracts'

/**
 * Request a short-lived URL for an authorized private object.
 * The server resolves the path to its database record before signing it.
 */
export async function createSignedStorageUrl(
  bucket: string,
  path: string,
  expiresIn = 600
): Promise<string | null> {
  if (!path) return null
  try {
    const params = new URLSearchParams({ bucket, path, expiresIn: String(expiresIn) })
    const response = await fetch(`/api/storage/signed-url?${params}`, { cache: 'no-store' })
    if (!response.ok) return null
    const body = await response.json() as { url?: string | null }
    return body.url ?? null
  } catch {
    return null
  }
}

