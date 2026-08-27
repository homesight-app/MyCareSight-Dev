import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import LeadsContent from '@/components/LeadsContent'
import FeatureGate from '@/components/FeatureGate'
import { AGENCY_LEAD_CONTEXT, type LeadContext } from '@/lib/constants/lead-configs'

const PAGE_SIZE = 50

export default async function AgencyLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; q?: string; stage?: string; serviceType?: string
    source?: string; sortKey?: string; sortDir?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const context: LeadContext = { ...AGENCY_LEAD_CONTEXT, agencyId }

  const params      = await searchParams
  const page        = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search      = params.q ?? ''
  const stageFilter = params.stage ?? 'active'
  const serviceType = params.serviceType ?? 'all'
  const source      = params.source ?? 'all'
  const sortKey     = params.sortKey ?? 'created_at'
  const sortDir     = (params.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'

  const [leadsResult, stageCounts, allSources, agencyStagesResult] = await Promise.all([
    q.getLeadsPaginated(supabase, {
      leadType: 'patient', agencyId, page, pageSize: PAGE_SIZE,
      search, stageFilter, serviceType, source, sortKey, sortDir,
    }),
    q.getLeadStageCounts(supabase, { leadType: 'patient', agencyId, search, serviceType, source }),
    q.getLeadDistinctSources(supabase, { leadType: 'patient', agencyId }),
    q.getAgencyLeadStages(supabase, agencyId),
  ])

  const leads = (leadsResult.data ?? []) as Parameters<typeof LeadsContent>[0]['leads']
  const agencyStages = (agencyStagesResult.data ?? []) as import('@/lib/constants/lead-configs').AgencyLeadStage[]

  return (
    <FeatureGate feature="leads" agencyId={agencyId}>
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
        context={context}
        stages={agencyStages}
      />
    </FeatureGate>
  )
}
