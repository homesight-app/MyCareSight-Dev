import type { SupabaseClient } from '@supabase/supabase-js'

/** Upload a file to a Supabase Storage bucket. Returns the stored path or an error. */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File
): Promise<{ path: string | null; error: Error | null }> {
  const { error } = await supabase.storage.from(bucket).upload(path, file)
  if (error) return { path: null, error: new Error(error.message) }
  return { path, error: null }
}
