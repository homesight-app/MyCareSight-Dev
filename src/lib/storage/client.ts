import type { SupabaseClient } from '@supabase/supabase-js'

/** Upload a file to a Supabase Storage bucket. Returns the stored path or an error. */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  options?: { upsert?: boolean; contentType?: string; cacheControl?: string }
): Promise<{ path: string | null; error: Error | null }> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, options)
  if (error) return { path: null, error: new Error(error.message) }
  return { path, error: null }
}

/** Remove one or more objects from a Supabase Storage bucket. */
export async function removeFiles(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<{ error: Error | null }> {
  if (paths.length === 0) return { error: null }
  const { error } = await supabase.storage.from(bucket).remove(paths)
  return { error: error ? new Error(error.message) : null }
}

/** Generate a time-limited signed URL for a private storage object. Returns null on failure. */
export async function getSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null
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
