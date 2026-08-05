import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import ExpertDashboardLayout from '@/components/ExpertDashboardLayout'
import AgencyDetailContent from '@/components/AgencyDetailContent'

export default async function ExpertAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  if (session.profile?.role !== 'expert') redirect('/pages/expert/clients')

  const { user, profile } = session
  const { id } = await params

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const [{ count: unreadNotifications }, { data: agency }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getAgencyById(supabaseAdmin, id),
  ])

  if (!agency) redirect('/pages/expert/agencies')

  const adminIds = normalizeAgencyAdminIds(agency.agency_admin_ids as string[] | string | null)

  const [{ data: agencyAdmins }, { data: licenses }, { data: applications }, { data: availableAdmins }, { data: programs }] = await Promise.all([
    adminIds.length > 0
      ? q.getAgencyAdminsByIds(supabaseAdmin, adminIds)
      : Promise.resolve({ data: [] }),
    q.getAgencyCertificationsWithHistory(supabaseAdmin, id),
    q.getApplicationsByAgencyId(supabaseAdmin, id),
    q.getUnassignedAgencyAdmins(supabaseAdmin),
    q.getApplicationsWithProgramsByAgencyId(supabaseAdmin, id),
  ])

  return (
    <ExpertDashboardLayout user={user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <AgencyDetailContent
        agency={agency}
        licenses={(licenses ?? []) as unknown as Parameters<typeof AgencyDetailContent>[0]['licenses']}
        applications={applications ?? []}
        agencyAdmins={agencyAdmins ?? []}
        availableAdmins={availableAdmins ?? []}
        backPath="/pages/expert/agencies"
        canEdit={true}
        programs={programs ?? []}
      />
    </ExpertDashboardLayout>
  )
}
