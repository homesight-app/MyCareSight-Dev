'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Get pricing that was effective for a specific month
 * @param year - Year (e.g., 2024)
 * @param month - Month (1-12)
 * @returns Pricing data that was effective for that month
 */
export async function getPricingForMonth(year: number, month: number) {
  const supabase = createAdminClient()

  try {
    // Get the first day of the specified month
    const targetDate = new Date(year, month - 1, 1)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    // Find the pricing record with the most recent effective_date that is <= target date
    // This gives us the pricing that was in effect for that month
    const { data: pricing, error } = await supabase
      .from('pricing')
      .select('*')
      .lte('effective_date', targetDateStr)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return { error: error.message, data: null }
    }

    // If no pricing found, return default values
    if (!pricing) {
      return {
        error: null,
        data: {
          owner_admin_license: 50,
          staff_license: 25,
          effective_date: targetDateStr
        }
      }
    }

    return { error: null, data: pricing }
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch pricing', data: null }
  }
}

/**
 * Get current pricing (most recent effective pricing)
 */
export async function getCurrentPricing() {
  const supabase = createAdminClient()

  try {
    const { data: pricing, error } = await supabase
      .from('pricing')
      .select('*')
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return { error: error.message, data: null }
    }

    // If no pricing found, return default values
    if (!pricing) {
      return {
        error: null,
        data: {
          owner_admin_license: 50,
          staff_license: 25
        }
      }
    }

    return { error: null, data: pricing }
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch pricing', data: null }
  }
}
