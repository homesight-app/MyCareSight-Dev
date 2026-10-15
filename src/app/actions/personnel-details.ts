'use server'

import { revalidatePath } from 'next/cache'
import {
  readPersonnelDetails,
  savePersonnelDetails,
} from '@/lib/repositories/personnel-details'
import type { PersonnelDetailsInput, PersonnelTarget } from '@/lib/schemas/personnel-details'

export async function getPersonnelDetailsAction(target: PersonnelTarget) {
  return readPersonnelDetails(target)
}

export async function savePersonnelDetailsAction(
  target: PersonnelTarget,
  details: PersonnelDetailsInput
) {
  const result = await savePersonnelDetails(target, details)
  if (result.success) {
    revalidatePath('/pages/agency/user-management')
    revalidatePath('/pages/agency/people')
    revalidatePath('/pages/agency/caregiver')
  }
  return result
}
