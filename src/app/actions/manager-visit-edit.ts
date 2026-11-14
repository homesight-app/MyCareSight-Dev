'use server'

import { revalidatePath } from 'next/cache'
import { prepareManagerVisitTimeSnapshot, readManagerVisitEditSnapshot, updateManagerVisit } from '@/lib/repositories/manager-visit-edit'
import { managerVisitEditSchema, type ManagerVisitEditInput } from '@/lib/schemas/manager-visit-edit'
import { zodErrorToFieldErrors } from '@/lib/validation'

function revalidateVisitSurfaces() {
  revalidatePath('/pages/agency/care-visits')
  revalidatePath('/pages/agency/time-billing')
  revalidatePath('/pages/agency/reports/payroll-billing')
  revalidatePath('/pages/agency/clients', 'layout')
  revalidatePath('/pages/caregiver/my-care-visits')
  revalidatePath('/pages/caregiver/my-care-visits', 'layout')
}

export async function readManagerVisitEditAction(scheduledVisitId: string) {
  return readManagerVisitEditSnapshot(scheduledVisitId)
}

export async function prepareManagerVisitTimeAction(scheduledVisitId: string) {
  return prepareManagerVisitTimeSnapshot(scheduledVisitId)
}

export async function updateManagerVisitAction(input: ManagerVisitEditInput): Promise<{
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}> {
  const parsed = managerVisitEditSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Check the highlighted visit details.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  }
  const result = await updateManagerVisit(parsed.data)
  if (!result.ok) return { success: false, error: result.error ?? 'Unable to update the visit.' }
  revalidateVisitSurfaces()
  return { success: true }
}
