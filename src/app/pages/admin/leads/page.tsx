import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import LeadsContent from '@/components/LeadsContent'
import { ADMIN_LEAD_CONTEXT } from '@/lib/constants/lead-configs'

export default async function AdminLeadsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: leads } = await q.getLeads(supabase, { leadType: 'agency', includeArchived: true })

  const today = new Date().toISOString().slice(0, 10)
  const activeLeadIds = (leads ?? [])
    .filter(l => l.status !== 'archived' && !['on_hold', 'lost', 'signed'].includes(l.stage))
    .map(l => l.id)
  const { data: taskRows } = await q.getLeadTaskStatusByLeadIds(supabase, activeLeadIds, today)

  const taskStatus: Record<string, 'overdue' | 'today'> = {}
  for (const row of taskRows ?? []) {
    if (!row.lead_id || !row.due_date) continue
    if (taskStatus[row.lead_id] === 'overdue') continue
    taskStatus[row.lead_id] = row.due_date < today ? 'overdue' : 'today'
  }

  return (
      <LeadsContent
        leads={leads ?? []}
        context={ADMIN_LEAD_CONTEXT}
        taskStatus={taskStatus}
      />
  )
}
