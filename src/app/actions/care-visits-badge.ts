'use server'

import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'

/** Sidebar badge: count of pending caregiver assignment + unassignment requests. */
export async function getCareVisitsPendingBadgeCountAction(): Promise<number> {
  const session = await getSession()
  if (!session) return 0
  const agencyId = session.profile?.agency_id ?? null
  if (!agencyId) return 0

  const [assignmentResult, unassignmentResult] = await Promise.all([
    q.getPendingScheduleAssignmentRequests(agencyId),
    q.getPendingScheduleUnassignmentRequests(agencyId),
  ])
  const assignmentCount = assignmentResult.data?.length ?? 0
  const unassignmentCount = unassignmentResult.data?.length ?? 0
  return assignmentCount + unassignmentCount
}
