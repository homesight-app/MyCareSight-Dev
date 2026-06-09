import type { SupabaseClient } from '@supabase/supabase-js'

export const STORAGE_BUCKET = {
  APPLICATION: 'application-documents',
  PATIENT: 'patient-documents',
  STAFF_MEMBER: 'staff-member-documents',
} as const

/**
 * Generate a time-limited signed URL for a private storage object.
 * Returns null if the path is missing or signing fails.
 */
export async function createSignedStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null

  // Legacy records may have stored full public URLs; extract just the object path.
  let storagePath = path
  if (path.includes('/storage/v1/object/')) {
    const marker = `/object/public/${bucket}/`
    const idx = path.indexOf(marker)
    storagePath = idx !== -1 ? path.slice(idx + marker.length) : path
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresIn)
  if (error) console.error('[storage] createSignedUrl failed:', bucket, error.message)
  return data?.signedUrl ?? null
}
