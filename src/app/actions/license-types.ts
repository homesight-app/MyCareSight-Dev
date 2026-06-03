'use server'

import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()

  // Parse processing time (e.g., "60 days" -> 60)
  const processingTimeMatch = data.processingTime.match(/(\d+)/)
  const processingTimeMin = processingTimeMatch ? parseInt(processingTimeMatch[1]) : null
  const processingTimeMax = processingTimeMin ? processingTimeMin : null

  // Parse application fee (e.g., "$500" -> 500.00)
  const feeMatch = data.applicationFee.replace(/[^0-9.]/g, '')
  const costMin = feeMatch ? parseFloat(feeMatch) : null
  const costMax = costMin

  // Parse service fee (e.g., "$350" -> 350.00); default to 0 if empty
  const serviceFeeMatch = (data.serviceFee || '').replace(/[^0-9.]/g, '')
  const serviceFee = serviceFeeMatch ? parseFloat(serviceFeeMatch) : 0
  const serviceFeeDisplay = data.serviceFee?.trim() || '$0'

  // Parse renewal period (e.g., "1 year" -> 1)
  const renewalMatch = data.renewalPeriod.match(/(\d+)/)
  const renewalPeriodYears = renewalMatch ? parseInt(renewalMatch[1]) : 1

  const { data: licenseType, error } = await supabase
    .from('license_types')
    .insert({
      state: data.state,
      name: data.name,
      description: data.description,
      cost_min: costMin,
      cost_max: costMax,
      cost_display: data.applicationFee,
      service_fee: serviceFee,
      service_fee_display: serviceFeeDisplay,
      processing_time_min: processingTimeMin,
      processing_time_max: processingTimeMax,
      processing_time_display: data.processingTime,
      renewal_period_years: renewalPeriodYears,
      renewal_period_display: data.renewalPeriod,
      icon_type: 'heart', // Default icon type
      requirements: [],
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message, data: null }
  }

  // Also create a corresponding entry in license_requirements for compatibility
  const { error: reqError } = await supabase
    .from('license_requirements')
    .insert({
      state: data.state,
      license_type: data.name,
    })
  
  // Ignore errors if it already exists (UNIQUE constraint)
  if (reqError && !reqError.message.includes('duplicate key')) {
    // Only log if it's not a duplicate key error
    console.warn('Failed to create license requirement:', reqError.message)
  }

  revalidateTag(CACHE_TAG_LICENSE_TYPES_ACTIVE)
  revalidatePath('/pages/admin/license-requirements')
  return { error: null, data: licenseType }
}

export async function updateLicenseTypeActive(id: string, isActive: boolean) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('license_types')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidateTag(CACHE_TAG_LICENSE_TYPES_ACTIVE)
  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}

export async function deleteLicenseType(id: string) {
  const supabase = await createClient()

  // Get the license type to find the name for license_requirements
  const { data: licenseType, error: fetchError } = await supabase
    .from('license_types')
    .select('name, state')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    return { error: fetchError.message }
  }

  if (!licenseType) {
    return { error: 'License type not found' }
  }

  const { error } = await supabase
    .from('license_types')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  // Also delete from license_requirements if it exists
  await supabase
    .from('license_requirements')
    .delete()
    .eq('state', licenseType.state)
    .eq('license_type', licenseType.name)

  revalidateTag(CACHE_TAG_LICENSE_TYPES_ACTIVE)
  revalidatePath('/pages/admin/license-requirements')
  return { error: null }
}
