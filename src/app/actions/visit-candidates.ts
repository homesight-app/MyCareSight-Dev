'use server'

import { getSession } from '@/lib/auth'
import type { CaregiverMatchOption } from '@/lib/caregiver-matching'
import { loadVisitCaregiverCandidates } from '@/lib/repositories/visit-caregiver-candidates'

export type { CaregiverMatchOption }

/** Fetch and rank caregiver candidates for a single visit (called on-demand when the assign modal opens). */
export async function getCaregiverCandidatesForVisitAction(
  visitId: string
): Promise<{ data: CaregiverMatchOption[] | null; error: string | null }> {
  const session = await getSession()
  if (!session?.user?.id) return { data: null, error: 'Not authenticated' }
  try {
    const result = await loadVisitCaregiverCandidates(visitId)
    return { data: result.candidates, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unable to load caregivers.' }
  }
}
