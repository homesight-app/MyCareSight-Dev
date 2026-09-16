import sql from '@/db'

export async function getSystemSettingsByCategory(
  category: string
): Promise<Record<string, string | null>> {
  try {
    const rows = await sql`SELECT key, value FROM system_settings WHERE category = ${category}`
    if (!rows || rows.length === 0) return {}
    return Object.fromEntries(rows.map(row => [row.key as string, row.value as string | null]))
  } catch {
    return {}
  }
}

export async function upsertSystemSetting(
  category: string,
  key: string,
  value: string | null,
  updatedBy: string
) {
  try {
    const payload = { category, key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    await sql`
      INSERT INTO system_settings ${sql(payload, ...keys)}
      ON CONFLICT (category, key) DO UPDATE SET ${sql(payload, ...keys)}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
