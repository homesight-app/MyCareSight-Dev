'use server'

import { revalidatePath } from 'next/cache'
import { zodErrorToFieldErrors } from '@/lib/validation'
import {
  publishVisitShiftOfferSchema,
  respondToVisitShiftOfferSchema,
  type PublishVisitShiftOfferInput,
  type RespondToVisitShiftOfferInput,
} from '@/lib/schemas/visit-shift-offers'
import {
  publishVisitShiftOffer,
  respondToVisitShiftOffer,
} from '@/lib/repositories/visit-shift-offers'

type ActionResult<T> = {
  success: boolean
  data?: T
  error?: string
  fieldErrors?: Record<string, string[]>
}

const MANAGER_PATH = '/pages/agency/care-visits'
const CAREGIVER_PATH = '/pages/caregiver/my-care-visits'

function revalidateShiftOfferPaths() {
  revalidatePath(MANAGER_PATH)
  revalidatePath(CAREGIVER_PATH)
  revalidatePath(CAREGIVER_PATH, 'layout')
}

export async function publishVisitShiftOfferAction(
  input: PublishVisitShiftOfferInput
): Promise<ActionResult<{ offerId: string; notifiedCount: number; newlyNotifiedCount: number }>> {
  const parsed = publishVisitShiftOfferSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Check the highlighted fields.',
      fieldErrors: zodErrorToFieldErrors(parsed.error),
    }
  }

  const result = await publishVisitShiftOffer(parsed.data)
  if (result.error || !result.data) {
    return { success: false, error: result.error?.message ?? 'Unable to advertise this shift.' }
  }
  revalidateShiftOfferPaths()
  return { success: true, data: result.data }
}

export async function respondToVisitShiftOfferAction(
  input: RespondToVisitShiftOfferInput
): Promise<ActionResult<{ offerId: string; response: 'interested' | 'not_interested'; requestId: string | null }>> {
  const parsed = respondToVisitShiftOfferSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Check the highlighted fields.',
      fieldErrors: zodErrorToFieldErrors(parsed.error),
    }
  }

  const result = await respondToVisitShiftOffer(parsed.data)
  if (result.error || !result.data) {
    return { success: false, error: result.error?.message ?? 'Unable to respond to this shift invitation.' }
  }
  revalidateShiftOfferPaths()
  return { success: true, data: result.data }
}
