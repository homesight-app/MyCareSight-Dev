'use server'

import sql from '@/db'
import { revalidatePath } from 'next/cache'

export interface UpdatePricingData {
  ownerAdminLicense: number
  staffLicense: number
}

export async function updatePricing(data: UpdatePricingData) {
  try {
    const [currentPricing] = await sql<{
      id: string
      owner_admin_license: number
      staff_license: number
      effective_date: string
    }[]>`
      SELECT * FROM pricing ORDER BY effective_date DESC LIMIT 1
    `

    if (currentPricing) {
      const ownerChanged = currentPricing.owner_admin_license !== data.ownerAdminLicense
      const staffChanged = currentPricing.staff_license !== data.staffLicense
      if (!ownerChanged && !staffChanged) return { error: null, data: currentPricing }
    }

    const now = new Date()
    const effectiveDateStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const [pricing] = await sql<{ id: string; owner_admin_license: number; staff_license: number; effective_date: string }[]>`
      INSERT INTO pricing (owner_admin_license, staff_license, effective_date)
      VALUES (${data.ownerAdminLicense}, ${data.staffLicense}, ${effectiveDateStr})
      RETURNING *
    `
    if (!pricing) return { error: 'Insert failed', data: null }

    revalidatePath('/pages/admin/configuration')
    revalidatePath('/pages/admin/billing')
    return { error: null, data: pricing }
  } catch (err: any) {
    return { error: err.message || 'Failed to update pricing', data: null }
  }
}

export interface UpdateLicenseTypeData {
  id: string
  renewalPeriod: string
  applicationFee: string
  serviceFee: string
  processingTime: string
}

export async function updateLicenseType(data: UpdateLicenseTypeData) {
  try {
    const processingTimeMatch = data.processingTime.match(/(\d+)/)
    const processingTimeMin = processingTimeMatch ? parseInt(processingTimeMatch[1]) : null
    const processingTimeMax = processingTimeMin

    const appFeeStr = data.applicationFee.replace(/[^0-9.]/g, '')
    const costMin = appFeeStr ? parseFloat(appFeeStr) : null
    const costMax = costMin

    const serviceFeeStr = data.serviceFee.replace(/[^0-9.]/g, '')
    const serviceFeeValue = serviceFeeStr ? parseFloat(serviceFeeStr) : null

    const renewalMatch = data.renewalPeriod.match(/(\d+)/)
    const renewalPeriodYears = renewalMatch ? parseInt(renewalMatch[1]) : 1

    const [licenseType] = await sql<{ id: string }[]>`
      UPDATE license_types SET
        cost_min               = ${costMin},
        cost_max               = ${costMax},
        cost_display           = ${data.applicationFee},
        service_fee            = ${serviceFeeValue || 0},
        service_fee_display    = ${data.serviceFee},
        processing_time_min    = ${processingTimeMin},
        processing_time_max    = ${processingTimeMax},
        processing_time_display = ${data.processingTime},
        renewal_period_years   = ${renewalPeriodYears},
        renewal_period_display = ${data.renewalPeriod}
      WHERE id = ${data.id}
      RETURNING *
    `
    if (!licenseType) return { error: 'License type not found', data: null }

    revalidatePath('/pages/admin/configuration')
    revalidatePath('/pages/admin/billing')
    return { error: null, data: licenseType }
  } catch (err: any) {
    return { error: err.message || 'Failed to update license type', data: null }
  }
}
