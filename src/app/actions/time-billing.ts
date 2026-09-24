'use server'

import { revalidatePath } from 'next/cache'
import { decideTimeBillingVisit } from '@/lib/repositories/visit-financial-writes'
import { saveVisitMileage } from '@/lib/repositories/financial-maintenance'

const PATH = '/pages/agency/time-billing'
const REPORT_PAYROLL_PATH = '/pages/agency/reports/payroll-billing'

type PendingPayload = {
  scheduledVisitId: string
  actualHours: number
  billableHours: number
  note: string
  serviceType: 'non_skilled' | 'skilled'
}

export async function approveTimeBillingRowAction(input: PendingPayload) {
  const result = await decideTimeBillingVisit({ ...input, decision: 'approved' })
  if (!result.ok) return { error: result.error }
  revalidatePath(PATH)
  revalidatePath(REPORT_PAYROLL_PATH)
  return { ok: true }
}

export async function voidTimeBillingRowAction(input: PendingPayload) {
  const result = await decideTimeBillingVisit({ ...input, decision: 'voided' })
  if (!result.ok) return { error: result.error }
  revalidatePath(PATH)
  revalidatePath(REPORT_PAYROLL_PATH)
  return { ok: true }
}

export async function updateVisitMileageAction(
  scheduledVisitId: string,
  mileageMiles: number | null
): Promise<{ ok: boolean; error?: string }> {
  const result = await saveVisitMileage({ scheduledVisitId, mileageMiles })
  if (!result.success) return { ok: false, error: result.error }

  revalidatePath(PATH)
  revalidatePath(REPORT_PAYROLL_PATH)
  return { ok: true }
}
