'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { clientPersonalInfoSchema } from '@/lib/schemas/client-personal-info'
import { saveClientPersonalInfo } from '@/lib/repositories/client-personal-info'
import { BranchError } from '@/lib/repositories/agency-branches'
import { zodErrorToFieldErrors } from '@/lib/validation'
import { CACHE_TAG_AGENCY_CLIENT_DETAIL } from '@/lib/cache-tags'

export async function saveClientPersonalInfoAction(patientId: string, input: unknown) {
  if (!z.uuid().safeParse(patientId).success) return { success: false as const, error: 'Invalid client.' }
  const parsed = clientPersonalInfoSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Check the highlighted fields.', fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try { await saveClientPersonalInfo(patientId, parsed.data) }
  catch (error) { return { success: false as const, error: error instanceof BranchError ? error.message : 'Unable to save client information. Refresh before retrying.' } }
  try {
    revalidateTag(CACHE_TAG_AGENCY_CLIENT_DETAIL)
    revalidatePath('/pages/agency/clients')
    revalidatePath(`/pages/agency/clients/${patientId}`)
  } catch { /* A committed save remains successful if cache invalidation fails. */ }
  return { success: true as const }
}
