import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import AgenciesContent from '@/components/AgenciesContent'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'

const PAGE_SIZE = 50

export default async function ExpertAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; sortKey?: string; sortDir?: string }>
}) {
  const params  = await searchParams
  const page    = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search  = params.q ?? ''
  const status  = params.status ?? 'active'
  const sortKey = params.sortKey ?? 'name'
  const sortDir = (params.sortDir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc'

  const supabaseAdmin = createAdminClient()

  const [agenciesResult, { data: agencyAdminsWithUser }] = await Promise.all([
    q.getAgenciesFilteredPaginated(supabaseAdmin, { page, pageSize: PAGE_SIZE, search, status, sortKey, sortDir }),
    q.getClientsWithCompanyOwner(supabaseAdmin),
  ])

  // Build admin lookup for current page's agencies
  const referencedAdminIds: string[] = []
  for (const a of agenciesResult.data ?? []) {
    for (const id of normalizeAgencyAdminIds(a.agency_admin_ids as string[] | string | null)) {
      referencedAdminIds.push(id)
    }
  }
  const withUserIdSet = new Set((agencyAdminsWithUser || []).map((r) => String(r.id)))
  const missingReferenced = Array.from(new Set(referencedAdminIds)).filter(id => !withUserIdSet.has(id))
  const { data: extraAdmins } =
    missingReferenced.length > 0
      ? await q.getAgencyAdminsByIds(supabaseAdmin, missingReferenced)
      : { data: [] as { id: string; contact_name: string | null; contact_email: string | null }[] }

  const agencyAdminById = new Map<string, { id: string; contact_name: string; contact_email: string }>()
  for (const row of [...(agencyAdminsWithUser || []), ...(extraAdmins || [])]) {
    const id = String(row.id)
    if (!agencyAdminById.has(id)) {
      agencyAdminById.set(id, { id, contact_name: row.contact_name ?? '', contact_email: row.contact_email ?? '' })
    }
  }
  const agencyAdmins = Array.from(agencyAdminById.values()).sort((a, b) =>
    (a.contact_name || a.contact_email).localeCompare(b.contact_name || b.contact_email, undefined, { sensitivity: 'base' })
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <AgenciesContent
        agencies={agenciesResult.data ?? []}
        totalCount={agenciesResult.count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        initialSearch={search}
        initialStatus={status}
        initialSortKey={sortKey}
        initialSortDir={sortDir}
        agencyAdmins={agencyAdmins}
        agencyAdminsForSelect={[]}
        detailBasePath="/pages/expert/agencies"
      />
    </div>
  )
}
