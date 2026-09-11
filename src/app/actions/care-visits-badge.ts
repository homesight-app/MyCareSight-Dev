'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPendingAssignmentRequestCountForBadge } from '@/lib/visit-assignment-dashboard'

/** Sidebar badge: same pending count as Visit Management → Assignment Requests. */
export async function getCareVisitsPendingBadgeCountAction(): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await getPendingAssignmentRequestCountForBadge(supabase)
  return count
}
