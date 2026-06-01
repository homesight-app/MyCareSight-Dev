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
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}
