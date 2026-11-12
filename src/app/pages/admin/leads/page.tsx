import { requireAdmin } from '@/lib/auth-helpers'
import * as q from '@/lib/supabase/query'
import LeadsContent from '@/components/LeadsContent'
import { ADMIN_LEAD_CONTEXT } from '@/lib/constants/lead-configs'
import { buildLeadTaskUrgencyMap } from '@/lib/lead-task-urgency'

const PAGE_SIZE = 50

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; q?: string; stage?: string; serviceType?: string
    source?: string; owner?: string; sortKey?: string; sortDir?: string
  }>
}) {
  await requireAdmin()

  const params      = await searchParams
  const page        = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search      = params.q ?? ''
  const stageFilter = params.stage ?? 'active'
  const serviceType = params.serviceType ?? 'all'
  const source      = params.source ?? 'all'
  const ownerParam  = params.owner ?? 'all'
  const owner       = ownerParam === 'all' || ownerParam === 'unassigned' || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerParam)
    ? ownerParam : 'all'
  const sortKey     = params.sortKey ?? 'created_at'
  const sortDir     = (params.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'

  const [leadsResult, stageCounts, allSources, ownerOptionsResult] = await Promise.all([
    q.getLeadsPaginated({
      leadType: 'agency', page, pageSize: PAGE_SIZE,
      search, stageFilter, serviceType, source, owner, sortKey, sortDir,
    }),
    q.getLeadStageCounts({ leadType: 'agency', search, serviceType, source, owner }),
    q.getLeadDistinctSources({ leadType: 'agency' }),
    q.getLeadOwnerOptions({ leadType: 'agency' }),
  ])

  const leads = (leadsResult.data ?? []) as Parameters<typeof LeadsContent>[0]['leads']
  const today = new Date().toISOString().slice(0, 10)
  const activeLeadIds = leads
    .filter(l => l.status !== 'archived' && !l.converted_at && !['on_hold', 'lost', 'signed'].includes(l.stage))
    .map(l => l.id)
  const { data: taskRows } = await q.getLeadTaskStatusByLeadIds(activeLeadIds, today)

  const taskStatus = buildLeadTaskUrgencyMap(taskRows ?? [], today)

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
      initialOwner={owner}
      initialSortKey={sortKey}
      initialSortDir={sortDir}
      stageCounts={stageCounts}
      allSources={allSources}
      ownerOptions={ownerOptionsResult.data ?? []}
      context={ADMIN_LEAD_CONTEXT}
      taskStatus={taskStatus}
    />
  )
}
