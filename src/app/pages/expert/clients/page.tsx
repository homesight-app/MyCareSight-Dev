import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const expertUserId = session!.user.id

  const [appsResult, { count: totalCount }, { count: activeCount }, { count: pendingCount }] =
    await Promise.all([
      q.getApplicationsByAssignedExpertIdPaginated(supabase, expertUserId, { page, pageSize: PAGE_SIZE, search }),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('assigned_expert_id', expertUserId),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('assigned_expert_id', expertUserId).in('status', ['requested', 'in_progress', 'under_review', 'needs_revision']),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('assigned_expert_id', expertUserId).in('status', ['under_review', 'needs_revision']),
    ])

  const agencyIds = Array.from(new Set(
    (appsResult.data ?? []).map(a => (a as Record<string, unknown>).agency_id as string).filter(Boolean)
  ))
  const { data: agenciesData } = agencyIds.length > 0
    ? await q.getAgenciesByIds(supabase, agencyIds)
    : { data: [] }
  const agencyNames: Record<string, string> = {}
  for (const a of agenciesData ?? []) agencyNames[a.id] = a.name

  return (
    <ExpertClientsContent
      applications={appsResult.data ?? []}
      totalCount={totalCount ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      initialSearch={search}
      totalApplications={totalCount ?? 0}
      activeApplications={activeCount ?? 0}
      pendingReviews={pendingCount ?? 0}
      agencyNames={agencyNames}
    />
  )
}
