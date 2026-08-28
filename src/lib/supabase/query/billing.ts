import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostgrestError } from '@supabase/supabase-js'

export interface BillingCode {
  id: string
  code: string
  name: string
  unit_type: 'hour' | 'visit' | '15_min_unit'
}

export async function getActiveBillingCodes(
  supabase: SupabaseClient
): Promise<{ data: BillingCode[] | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('billing_codes')
    .select('id, code, name, unit_type')
    .eq('is_active', true)
    .order('code', { ascending: true })
  return { data: data as BillingCode[] | null, error }
}
