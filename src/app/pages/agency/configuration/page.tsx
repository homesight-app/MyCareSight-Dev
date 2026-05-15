import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import DashboardLayout from '@/components/DashboardLayout'
import AgencyConfigurationContent from '@/components/AgencyConfigurationContent'

export default async function AgencyConfigurationPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const { data: profile } = await q.getUserProfileFull(
    await createClient(),
    session.user.id
  )
  assertAgencyReportsPageAccess(profile)

  const supabase = await createClient()
  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)

  const agencyId = (profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const config = agencyId
    ? (await q.getAgencyConfiguration(supabase, agencyId)).data
    : null

  return (
    <DashboardLayout
      user={session.user}
      profile={profile}
      unreadNotifications={unreadNotifications || 0}
    >
      <AgencyConfigurationContent initialConfig={config} />
    </DashboardLayout>
  )
}
