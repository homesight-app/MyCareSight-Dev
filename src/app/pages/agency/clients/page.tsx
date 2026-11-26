import { z } from 'zod'
import { agencyBranchesEnabled } from '@/lib/agency-branches'
import { CLIENT_LIST_SORT_KEYS } from '@/lib/client-list'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import ClientsContent from '@/components/ClientsContent'
import FeatureGate from '@/components/FeatureGate'
import { requireAgencyCapability } from '@/lib/feature-access'
import FeatureLockedPage from '@/components/FeatureLockedPage'

const PAGE_SIZE = 50

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; page?: string; q?: string; status?: string; sortKey?: string; sortDir?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  try {
    await requireAgencyCapability('client_management')
  } catch {
    return <FeatureLockedPage capabilityKey="client_management" />
  }

  const params = await searchParams
  const branchesEnabled = agencyBranchesEnabled()
  if (branchesEnabled && params.branch && !z.uuid().safeParse(params.branch).success) return <p role="alert">Invalid branch filter.</p>
  const branchId = branchesEnabled ? params.branch : undefined

  const page         = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search       = params.q ?? ''
  const statusFilter = params.status ?? 'active'
  const requestedSort = z.enum(CLIENT_LIST_SORT_KEYS).catch('created_at').parse(params.sortKey)
  const sortKey = requestedSort === 'branch_name' && !branchesEnabled ? 'created_at' : requestedSort
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc'

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const role = session!.profile?.role ?? ''

  const [clientsResult, counts] = agencyId
    ? await withUserContext(session!.user.id, role, agencyId, () =>
        Promise.all([
          q.getPatientsByAgencyId(agencyId, { page, pageSize: PAGE_SIZE, search, status: statusFilter, branchId, sortKey, sortDir }),
          q.getPatientCountsByAgencyId(agencyId, branchId),
        ])
      )
    : [{ data: [], count: 0, error: null }, { total: 0, active: 0 }]

  const clients = clientsResult.data ?? []
  const totalCount = clientsResult.count ?? 0

  return (
    <FeatureGate capability="client_management" agencyId={agencyId}>
      <ClientsContent
        key={agencyId ?? 'no-agency'}
        branchesEnabled={branchesEnabled}
        branchFilter={branchId ?? ''}
        sortKey={sortKey}
        sortDir={sortDir}
        error={clientsResult.error ? 'Unable to load clients. Please try again.' : null}
        clients={clients}
        totalCount={totalCount}
        activeCount={counts.active}
        totalAllCount={counts.total}
        page={page}
        pageSize={PAGE_SIZE}
        search={search}
        statusFilter={statusFilter}
      />
    </FeatureGate>
  )
}
