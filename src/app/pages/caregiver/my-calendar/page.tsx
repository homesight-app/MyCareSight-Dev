import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import CaregiverMyCalendarContent from '@/components/CaregiverMyCalendarContent'
import { requireAgencyCapability } from '@/lib/feature-access'
import FeatureLockedPage from '@/components/FeatureLockedPage'

export default async function CaregiverMyCalendarPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  try { await requireAgencyCapability('care_operations') } catch {
    return <FeatureLockedPage capabilityKey="care_operations" />
  }

  const { data: staffMember, error: staffMemberError } = await q.getStaffMemberByUserId(session.user.id)
  if (staffMemberError || !staffMember) {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }

  const { data: slotsData, error: slotsError } = await q.getCaregiverAvailabilitySlots(staffMember.id)
  const initialSlots = slotsError ? [] : (slotsData ?? [])

  return <CaregiverMyCalendarContent initialSlots={initialSlots} caregiverMemberId={staffMember.id} />
}
