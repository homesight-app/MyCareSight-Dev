import sql from '@/db'

export interface BillingCode {
  id: string
  code: string
  name: string
  unit_type: 'hour' | 'visit' | '15_min_unit'
}

export async function getActiveBillingCodes(): Promise<{ data: BillingCode[] | null; error: Error | null }> {
  try {
    const rows = await sql`
      SELECT id, code, name, unit_type
      FROM billing_codes
      WHERE is_active = true
      ORDER BY code ASC
    `
    return { data: rows as unknown as BillingCode[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
