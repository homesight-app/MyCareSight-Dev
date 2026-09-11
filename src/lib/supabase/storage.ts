export const STORAGE_BUCKET = {
  APPLICATION: 'application-documents',
  PATIENT: 'patient-documents',
  STAFF_MEMBER: 'staff-member-documents',
  LEAD: 'lead-documents',
  AGENCY: 'agency-documents',
  AGENCY_PUBLIC: 'agency-public',
  LICENSE_TEMPLATES: 'license-templates',
} as const

/**
 * Generate a time-limited signed URL for a private storage object.
 * Routes through /api/storage/signed-url so the Azure credential stays server-side.
 * Returns null if the path is missing or signing fails.
 */
export async function createSignedStorageUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null
  try {
    const params = new URLSearchParams({ bucket, path, expiresIn: String(expiresIn) })
    const res = await fetch(`/api/storage/signed-url?${params}`, { cache: 'no-store' })
    if (!res.ok) return null
    const { url } = await res.json()
    return url ?? null
  } catch {
    return null
  }
}
