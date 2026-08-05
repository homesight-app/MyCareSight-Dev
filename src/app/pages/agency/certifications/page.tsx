import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import AgencyCertificationsContent from '@/components/AgencyCertificationsContent'
import { type CertLicense } from '@/components/CertificationDetailModal'

export default async function AgencyCertificationsPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/agency')

  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: up }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, session.user.id),
    q.getAgencyIdFromProfile(supabase, session.user.id),
  ])

  const agencyId = up?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const { data: certifications } = await q.getAgencyCertificationsWithHistory(supabase, agencyId)

  return (
    <DashboardLayout user={session.user} profile={session.profile} unreadNotifications={unreadNotifications || 0}>
      <AgencyCertificationsContent
        certifications={(certifications ?? []) as unknown as CertLicense[]}
        agencyId={agencyId}
      />
    </DashboardLayout>
  )
}
