import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import AdminLeadsSummaryReport from '@/components/AdminLeadsSummaryReport'

export default async function LeadsSummaryReportPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: leads }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getLeads(supabase, { leadType: 'agency', includeArchived: true }),
  ])

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <AdminLeadsSummaryReport leads={leads ?? []} />
    </AdminLayout>
  )
}
