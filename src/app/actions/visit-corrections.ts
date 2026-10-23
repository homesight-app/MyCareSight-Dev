'use server'

import { revalidatePath } from 'next/cache'
import { correctVisit, readVisitCorrectionHistory } from '@/lib/repositories/visit-corrections'
import type { VisitCorrectionInput } from '@/lib/schemas/visit-correction'

export async function correctVisitAction(input: VisitCorrectionInput) {
  const result = await correctVisit(input)
  if (result.ok) {
    revalidatePath('/pages/agency/care-visits')
    revalidatePath('/pages/agency/time-billing')
    revalidatePath('/pages/agency/reports/payroll-billing')
    revalidatePath('/pages/caregiver/my-care-visits')
    revalidatePath('/pages/caregiver/my-care-visits', 'layout')
  }
  return result
}

export async function readVisitCorrectionHistoryAction(scheduledVisitId: string) {
  return readVisitCorrectionHistory(scheduledVisitId)
}
