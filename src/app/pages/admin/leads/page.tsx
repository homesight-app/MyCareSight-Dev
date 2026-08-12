import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import LeadsContent from '@/components/LeadsContent'
import { ADMIN_LEAD_CONTEXT } from '@/lib/constants/lead-configs'

const PAGE_SIZE = 50

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; q?: string; stage?: string; serviceType?: string
    source?: string; sortKey?: string; sortDir?: string
  }>
}) {
  await requireAdmin()
  const supabase = await createClient()

  const params      = await searchParams
  const page        = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search      = params.q ?? ''
  const stageFilter = params.stage ?? 'active'
  const serviceType = params.serviceType ?? 'all'
  const source      = params.source ?? 'all'
  const sortKey     = params.sortKey ?? 'created_at'
  const sortDir     = (params.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'

  const [leadsResult, stageCounts, allSources] = await Promise.all([
    q.getLeadsPaginated(supabase, {
      leadType: 'agency', page, pageSize: PAGE_SIZE,
      search, stageFilter, serviceType, source, sortKey, sortDir,
    }),
    q.getLeadStageCounts(supabase, { leadType: 'agency', search, serviceType, source }),
    q.getLeadDistinctSources(supabase, { leadType: 'agency' }),
  ])

  const leads = (leadsResult.data ?? []) as Parameters<typeof LeadsContent>[0]['leads']
  const today = new Date().toISOString().slice(0, 10)
  const activeLeadIds = leads
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
      leads={leads}
      totalCount={leadsResult.count}
      page={page}
      pageSize={PAGE_SIZE}
      initialSearch={search}
      initialStageFilter={stageFilter}
      initialServiceType={serviceType}
      initialSource={source}
      initialSortKey={sortKey}
      initialSortDir={sortDir}
      stageCounts={stageCounts}
      allSources={allSources}
      context={ADMIN_LEAD_CONTEXT}
      taskStatus={taskStatus}
    />
  )
}
