import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import LeadsContent from '@/components/LeadsContent'
import { ADMIN_LEAD_CONTEXT } from '@/lib/constants/lead-configs'

export default async function AdminLeadsPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: leads }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getLeads(supabase, { leadType: 'agency' }),
  ])

  return (
    <AdminLayout
      user={user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    >
      <LeadsContent
        leads={leads ?? []}
        context={ADMIN_LEAD_CONTEXT}
      />
    </AdminLayout>
  )
}
