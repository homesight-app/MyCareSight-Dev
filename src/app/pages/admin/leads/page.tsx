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

  const today = new Date().toISOString().slice(0, 10)
  const activeLeadIds = (leads ?? [])
    .filter(l =>
      !['on_hold', 'lost'].includes(l.stage) &&
      !(l.stage === 'signed' && !!l.retainer_paid_date)
    )
    .map(l => l.id)
  const { data: taskRows } = await q.getLeadTaskStatusByLeadIds(supabase, activeLeadIds, today)

  const taskStatus: Record<string, 'overdue' | 'today'> = {}
  for (const row of taskRows ?? []) {
    if (!row.lead_id || !row.due_date) continue
    if (taskStatus[row.lead_id] === 'overdue') continue
    taskStatus[row.lead_id] = row.due_date < today ? 'overdue' : 'today'
  }

  return (
    <AdminLayout
      user={user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    >
      <LeadsContent
        leads={leads ?? []}
        context={ADMIN_LEAD_CONTEXT}
        taskStatus={taskStatus}
      />
    </AdminLayout>
  )
}
