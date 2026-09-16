'use server'

import sql from '@/db'

/**
 * Get pricing that was effective for a specific month
 * @param year - Year (e.g., 2024)
 * @param month - Month (1-12)
 * @returns Pricing data that was effective for that month
 */
export async function getPricingForMonth(year: number, month: number) {
  try {
    const targetDate = new Date(year, month - 1, 1)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    const [pricing] = await sql<{ owner_admin_license: number; staff_license: number; effective_date: string }[]>`
      SELECT * FROM pricing
      WHERE effective_date <= ${targetDateStr}
      ORDER BY effective_date DESC
      LIMIT 1
    `

    if (!pricing) {
      return {
        error: null,
        data: { owner_admin_license: 50, staff_license: 25, effective_date: targetDateStr }
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
  try {
    const [pricing] = await sql<{ owner_admin_license: number; staff_license: number }[]>`
      SELECT * FROM pricing ORDER BY effective_date DESC LIMIT 1
    `

    if (!pricing) {
      return { error: null, data: { owner_admin_license: 50, staff_license: 25 } }
    }

    return { error: null, data: pricing }
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch pricing', data: null }
  }
}
