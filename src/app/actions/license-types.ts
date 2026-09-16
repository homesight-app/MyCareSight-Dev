'use server'

import sql from '@/db'
import { revalidatePath, revalidateTag } from 'next/cache'
import { CACHE_TAG_LICENSE_TYPES_ACTIVE } from '@/lib/cache-tags'

export interface CreateLicenseTypeData {
  state: string
  name: string
  description: string
  processingTime: string
  applicationFee: string
  serviceFee: string
  renewalPeriod: string
}

export async function createLicenseType(data: CreateLicenseTypeData) {
  const processingTimeMatch = data.processingTime.match(/(\d+)/)
  const processingTimeMin = processingTimeMatch ? parseInt(processingTimeMatch[1]) : null
  const processingTimeMax = processingTimeMin

  const feeStr = data.applicationFee.replace(/[^0-9.]/g, '')
  const costMin = feeStr ? parseFloat(feeStr) : null
  const costMax = costMin

  const serviceFeeStr = (data.serviceFee || '').replace(/[^0-9.]/g, '')
  const serviceFee = serviceFeeStr ? parseFloat(serviceFeeStr) : 0
  const serviceFeeDisplay = data.serviceFee?.trim() || '$0'

  const renewalMatch = data.renewalPeriod.match(/(\d+)/)
  const renewalPeriodYears = renewalMatch ? parseInt(renewalMatch[1]) : 1

  const [licenseType] = await sql<{ id: string; state: string; name: string }[]>`
    INSERT INTO license_types (
      state, name, description, cost_min, cost_max, cost_display,
      service_fee, service_fee_display,
      processing_time_min, processing_time_max, processing_time_display,
      renewal_period_years, renewal_period_display,
      icon_type, requirements, is_active
    ) VALUES (
      ${data.state}, ${data.name}, ${data.description},
      ${costMin}, ${costMax}, ${data.applicationFee},
      ${serviceFee}, ${serviceFeeDisplay},
      ${processingTimeMin}, ${processingTimeMax}, ${data.processingTime},
      ${renewalPeriodYears}, ${data.renewalPeriod},
      'heart', '{}', true
    )
    RETURNING *
  `
  if (!licenseType) return { error: 'Insert failed', data: null }

  // Create matching license_requirements row for compatibility (ignore duplicate)
  try {
    await sql`
      INSERT INTO license_requirements (state, license_type)
      VALUES (${data.state}, ${data.name})
      ON CONFLICT DO NOTHING
    `
  } catch (reqErr: any) {
    if (!reqErr.message?.includes('duplicate key')) {
      console.warn('Failed to create license requirement:', reqErr.message)
    }
  }

  revalidateTag(CACHE_TAG_LICENSE_TYPES_ACTIVE)
  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: licenseType }
}

export async function updateLicenseTypeActive(id: string, isActive: boolean) {
  try {
    await sql`UPDATE license_types SET is_active = ${isActive} WHERE id = ${id}`
  } catch (err: any) {
    return { error: err.message }
  }

  revalidateTag(CACHE_TAG_LICENSE_TYPES_ACTIVE)
  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

export async function deleteLicenseType(id: string) {
  const [licenseType] = await sql<{ name: string; state: string }[]>`
    SELECT name, state FROM license_types WHERE id = ${id} LIMIT 1
  `
  if (!licenseType) return { error: 'License type not found' }

  try {
    await sql`DELETE FROM license_types WHERE id = ${id}`
  } catch (err: any) {
    return { error: err.message }
  }

  // Best-effort delete from license_requirements
  try {
    await sql`
      DELETE FROM license_requirements
      WHERE state = ${licenseType.state} AND license_type = ${licenseType.name}
    `
  } catch {
    // not critical
  }

  revalidateTag(CACHE_TAG_LICENSE_TYPES_ACTIVE)
  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}
