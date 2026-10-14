import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import AgencyProgramsContent from '@/components/AgencyProgramsContent'
import { requireAgencyCapability } from '@/lib/feature-access'
import FeatureLockedPage from '@/components/FeatureLockedPage'
import { withUserContext } from '@/db'

const PAGE_SIZE = 50

export default async function AgencyProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/agency')
  let actor
  try { actor = await requireAgencyCapability('homesights_services') } catch {
    return <FeatureLockedPage capabilityKey="homesights_services" />
  }

  const params = await searchParams
  const page   = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search = params.q ?? ''

  const [result, { data: pendingRequests }] = await withUserContext(
    actor.userId,
    actor.role,
    actor.agencyId,
    () => Promise.all([
      q.getApplicationsWithProgramsPaginated(actor.agencyId, { page, pageSize: PAGE_SIZE, search }),
      q.getRequestedProgramsForAgency(actor.agencyId),
    ])
  )

  type RawRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    assigned_expert_id: string | null
    application_playbook_items: { status: 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'; requirement_type: string }[]
  }

  type PendingRow = {
    id: string
    application_name: string
    state: string
    status: string
    created_at: string
  }

  return (
    <AgencyProgramsContent
      programs={(result.data ?? []) as unknown as RawRow[]}
      totalCount={result.count}
      page={page}
      pageSize={PAGE_SIZE}
      initialSearch={search}
      pendingRequests={(pendingRequests ?? []) as unknown as PendingRow[]}
    />
  )
}
