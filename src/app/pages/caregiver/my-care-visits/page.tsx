import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import CaregiverMyCareVisitsContent from '@/components/CaregiverMyCareVisitsContent'
import { fetchCaregiverCareVisitsData } from '@/lib/caregiver-care-visits'
import { getCaregiverVisitDateRange } from '@/lib/caregiver-care-visits-shared'
import { withAuditedActiveCaregiverRead } from '@/lib/repositories/caregiver-visit-execution'

export default async function CaregiverMyCareVisitsPage() {
  const session = await getSession()
  if (!session?.user.id) {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }
  let data
  try {
    data = await withAuditedActiveCaregiverRead(session.user.id, 'caregiver_visit_list', null, async actor => {
      const { startDate, endDate } = getCaregiverVisitDateRange()
      const { data: rows, error } = await q.getCaregiverVisibleSchedulesForRange(
        actor.agencyId, actor.caregiverMemberId, startDate, endDate
      )
      if (error) throw error
      return fetchCaregiverCareVisitsData(actor.caregiverMemberId, actor.agencyId, (rows as any[]) ?? [])
    })
  } catch {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }

  return (
    <CaregiverMyCareVisitsContent
      visits={data.visits}
      mineCount={data.mineCount}
      openCount={data.openCount}
      todayCount={data.todayCount}
    />
  )
}
