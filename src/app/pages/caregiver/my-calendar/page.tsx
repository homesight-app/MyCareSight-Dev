import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import CaregiverMyCalendarContent from '@/components/CaregiverMyCalendarContent'

export default async function CaregiverMyCalendarPage() {
  const session = await getSession()

  const supabase = await createClient()
  const { data: staffMember, error: staffMemberError } = await q.getStaffMemberByUserId(supabase, session!.user.id)
  if (staffMemberError || !staffMember) {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }

  const { data: slotsData, error: slotsError } = await q.getCaregiverAvailabilitySlots(supabase, staffMember.id)
  const initialSlots = slotsError ? [] : (slotsData ?? [])

  return <CaregiverMyCalendarContent initialSlots={initialSlots} caregiverMemberId={staffMember.id} />
}
