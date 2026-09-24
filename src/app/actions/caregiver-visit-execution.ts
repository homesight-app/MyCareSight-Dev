'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { CACHE_TAG_CAREGIVER_VISIT_EXECUTION, caregiverVisitExecutionTag } from '@/lib/cache-tags'
import { getSession } from '@/lib/auth'
import { fetchCaregiverPastVisitSummary } from '@/lib/caregiver-visit-execution'
import type { CaregiverPastVisitSummaryDTO } from '@/lib/caregiver-visit-execution'
import {
  clockInCaregiverVisit,
  clockOutCaregiverVisit,
  saveCaregiverVisitNotes,
  setCaregiverVisitTaskCompleted,
  withAuditedActiveCaregiverRead,
} from '@/lib/repositories/caregiver-visit-execution'

const CAREGIVER_VISITS = '/pages/caregiver/my-care-visits'

function revalidateVisitPages(visitId: string) {
  revalidatePath(CAREGIVER_VISITS)
  revalidatePath(CAREGIVER_VISITS, 'layout')
  revalidatePath(`${CAREGIVER_VISITS}/${visitId}`)
  revalidateTag(caregiverVisitExecutionTag(visitId))
  revalidateTag(CACHE_TAG_CAREGIVER_VISIT_EXECUTION)
}

export async function caregiverClockInAction(
  visitId: string,
  latitude: number | null,
  longitude: number | null
): Promise<{ ok?: true; error?: string }> {
  const result = await clockInCaregiverVisit({ visitId, latitude, longitude })
  if (!result.ok) return result

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function caregiverClockOutAction(
  visitId: string,
  latitude: number | null,
  longitude: number | null
): Promise<{ ok?: true; error?: string }> {
  const result = await clockOutCaregiverVisit({ visitId, latitude, longitude })
  if (!result.ok) return result

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function caregiverSetTaskCompletedAction(
  visitId: string,
  scheduledVisitTaskId: string,
  completed: boolean
): Promise<{ ok?: true; error?: string }> {
  const result = await setCaregiverVisitTaskCompleted({ visitId, scheduledVisitTaskId, completed })
  if (!result.ok) return result

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function caregiverSaveVisitNotesAction(
  visitId: string,
  notes: string
): Promise<{ ok?: true; error?: string }> {
  const result = await saveCaregiverVisitNotes({ visitId, notes })
  if (!result.ok) return result

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function getCaregiverPastVisitSummaryAction(
  visitId: string
): Promise<{ summary: CaregiverPastVisitSummaryDTO } | { error: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  try {
    const result = await withAuditedActiveCaregiverRead(session.user.id, 'past_visit_summary', visitId, actor =>
      fetchCaregiverPastVisitSummary(visitId, actor.caregiverMemberId, actor.agencyId)
    )
    if (!result.data) return { error: result.error ?? 'Could not load visit summary.' }
    return { summary: result.data }
  } catch {
    return { error: 'An active caregiver account and agency membership are required.' }
  }
}
