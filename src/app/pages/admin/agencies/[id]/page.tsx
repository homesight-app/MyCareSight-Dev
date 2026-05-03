import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import AdminLayout from '@/components/AdminLayout'
import AgencyDetailContent from '@/components/AgencyDetailContent'

export default async function AdminAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { id } = await params

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const [{ count: unreadNotifications }, { data: agency }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getAgencyById(supabaseAdmin, id),
  ])

  if (!agency) redirect('/pages/admin/agencies')

  const adminIds = normalizeAgencyAdminIds(agency.agency_admin_ids as string[] | string | null)

  const [{ data: agencyAdmins }, { data: licenses }, { data: applications }, { data: availableAdmins }] = await Promise.all([
    adminIds.length > 0
      ? q.getAgencyAdminsByIds(supabaseAdmin, adminIds)
      : Promise.resolve({ data: [] }),
    q.getLicensesByAgencyId(supabaseAdmin, id),
    q.getApplicationsByAgencyId(supabaseAdmin, id),
    q.getUnassignedAgencyAdmins(supabaseAdmin),
  ])

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <AgencyDetailContent
        agency={agency}
        licenses={licenses ?? []}
        applications={applications ?? []}
        agencyAdmins={agencyAdmins ?? []}
        availableAdmins={availableAdmins ?? []}
        backPath="/pages/admin/agencies"
      />
    </AdminLayout>
  )
}
