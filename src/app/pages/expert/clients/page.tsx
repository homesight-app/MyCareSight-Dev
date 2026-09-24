import { getSession } from '@/lib/auth'
import { readExpertClientDashboardMetrics } from '@/lib/repositories/platform-application-dashboard'
import * as q from '@/lib/supabase/query'
import ExpertClientsContent from '@/components/ExpertClientsContent'

const PAGE_SIZE = 50

export default async function ExpertClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const session = await getSession()
  const params  = await searchParams
  const page    = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search  = params.q ?? ''

  const expertUserId = session!.user.id

  const [appsResult, metricsResult] =
    await Promise.all([
      q.getApplicationsByAssignedExpertIdPaginated(expertUserId, { page, pageSize: PAGE_SIZE, search }),
      readExpertClientDashboardMetrics(expertUserId),
    ])
  const metrics = metricsResult.data ?? { totalCount: 0, activeCount: 0, pendingCount: 0 }

  const agencyIds = Array.from(new Set(
    (appsResult.data ?? []).map(a => (a as Record<string, unknown>).agency_id as string).filter(Boolean)
  ))
  const { data: agenciesData } = agencyIds.length > 0
    ? await q.getAgenciesByIds(agencyIds)
    : { data: [] }
  const agencyNames: Record<string, string> = {}
  for (const a of agenciesData ?? []) agencyNames[a.id] = a.name

  return (
    <ExpertClientsContent
      applications={appsResult.data ?? []}
      totalCount={metrics.totalCount}
      page={page}
      pageSize={PAGE_SIZE}
      initialSearch={search}
      totalApplications={metrics.totalCount}
      activeApplications={metrics.activeCount}
      pendingReviews={metrics.pendingCount}
      agencyNames={agencyNames}
    />
  )
}
