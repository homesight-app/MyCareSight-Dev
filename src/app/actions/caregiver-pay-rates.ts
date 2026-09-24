'use server'

import { revalidatePath } from 'next/cache'
import { savePayRateBatch, saveCaregiverProfile, type PayRateSaveResult } from '@/lib/repositories/caregiver-pay-rate-writes'
import type { PayRateMutationInput, PayRateBatchInput } from '@/lib/schemas/caregiver-pay-rates'
import type { CaregiverEditInput } from '@/lib/schemas/caregiver-edit'

function refresh(result: PayRateSaveResult) {
  if (!result.success) return
  try {
    for (const path of ['/pages/agency/caregiver','/pages/agency/user-management',
      '/pages/agency/time-billing','/pages/agency/reports/payroll-billing','/pages/caregiver']) revalidatePath(path)
    for (const id of result.caregiverIds ?? []) revalidatePath('/pages/agency/caregiver/' + id)
  } catch {
    // A cache refresh failure must not misreport a committed transaction as failed.
  }
}

export async function saveCaregiverPayRatesAction(input: PayRateBatchInput) {
  const result = await savePayRateBatch(input)
  refresh(result)
  return result
}

export async function appendCaregiverPayRateAction(input: PayRateMutationInput) {
  const result = await savePayRateBatch({rates:[input]})
  refresh(result)
  return { ...result, ok: result.success ? true as const : undefined }
}

export async function saveCaregiverProfileAction(caregiverId: string, input: CaregiverEditInput) {
  const result = await saveCaregiverProfile(caregiverId,input)
  refresh(result)
  return result
}
