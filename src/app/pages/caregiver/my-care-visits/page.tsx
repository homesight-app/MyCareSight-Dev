import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import CaregiverMyCareVisitsContent from '@/components/CaregiverMyCareVisitsContent'
import { fetchCaregiverCareVisitsData } from '@/lib/caregiver-care-visits'
import { getDefaultScheduledVisitBulkDateRange } from '@/lib/supabase/query/schedules'

export default async function CaregiverMyCareVisitsPage() {
  const session = await getSession()

  const { data: staffMember, error: staffMemberError } = await q.getStaffMemberByUserId(session!.user.id)
  if (staffMemberError || !staffMember) {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }

  const agencyId = staffMember.agency_id ?? null
  const role = session!.profile?.role ?? ''
  let scheduleRows: any[] = []
  if (agencyId) {
    const { startDate, endDate } = getDefaultScheduledVisitBulkDateRange()
    const { data } = await q.getScheduledVisitsAsScheduleRowsForAgencyAndDateRange(agencyId, startDate, endDate)
    scheduleRows = (data as any[]) ?? []
  }

  const data = await withUserContext(session!.user.id, role, agencyId, () =>
    fetchCaregiverCareVisitsData(staffMember.id, agencyId, scheduleRows as any)
  )

  return (
    <CaregiverMyCareVisitsContent
      visits={data.visits}
      mineCount={data.mineCount}
      openCount={data.openCount}
      todayCount={data.todayCount}
    />
  )
}
