import type { Supabase } from '../types'

export async function getSystemSettingsByCategory(
  supabase: Supabase,
  category: string
): Promise<Record<string, string | null>> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .eq('category', category)
  if (error || !data) return {}
  return Object.fromEntries(data.map(row => [row.key, row.value]))
}

export async function upsertSystemSetting(
  supabase: Supabase,
  category: string,
  key: string,
  value: string | null,
  updatedBy: string
) {
  return supabase.from('system_settings').upsert(
    { category, key, value, updated_by: updatedBy, updated_at: new Date().toISOString() },
    { onConflict: 'category,key' }
  )
}
