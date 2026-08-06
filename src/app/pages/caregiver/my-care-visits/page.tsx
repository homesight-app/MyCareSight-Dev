import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import CaregiverMyCareVisitsContent from '@/components/CaregiverMyCareVisitsContent'
import { fetchCaregiverCareVisitsData } from '@/lib/caregiver-care-visits'

export default async function CaregiverMyCareVisitsPage() {
  const session = await getSession()

  const supabase = await createClient()
  const { data: staffMember, error: staffMemberError } = await q.getStaffMemberByUserId(supabase, session!.user.id)
  if (staffMemberError || !staffMember) {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }

  const data = await fetchCaregiverCareVisitsData(supabase, staffMember.id, staffMember.agency_id ?? null)

  return (
    <CaregiverMyCareVisitsContent
      visits={data.visits}
      mineCount={data.mineCount}
      openCount={data.openCount}
      todayCount={data.todayCount}
    />
  )
}
