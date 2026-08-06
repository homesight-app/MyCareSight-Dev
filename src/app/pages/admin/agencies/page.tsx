import { requireAdmin } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import AgenciesContent from '@/components/AgenciesContent'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'

const PAGE_SIZE = 50

export default async function AgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; sortKey?: string; sortDir?: string }>
}) {
  await requireAdmin()

  const params  = await searchParams
  const page    = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search  = params.q ?? ''
  const status  = params.status ?? 'active'
  const sortKey = params.sortKey ?? 'name'
  const sortDir = (params.sortDir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc'

  const supabaseAdmin = createAdminClient()

  const [agenciesResult, { data: agencyAdminsWithUser }, { data: allAgencyAdminIds }] =
    await Promise.all([
      q.getAgenciesFilteredPaginated(supabaseAdmin, { page, pageSize: PAGE_SIZE, search, status, sortKey, sortDir }),
      q.getClientsWithCompanyOwner(supabaseAdmin),
      supabaseAdmin.from('agencies').select('agency_admin_ids'),
    ])

  // Build admin lookup: include any IDs referenced in agency_admin_ids that aren't company owners
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

  // agencyAdminsForSelect: admins not assigned to ANY agency (uses full agency list, not just current page)
  const assignedAdminIds = new Set<string>()
  for (const a of allAgencyAdminIds || []) {
    normalizeAgencyAdminIds(a.agency_admin_ids as string[] | string | null).forEach(id =>
      assignedAdminIds.add(String(id))
    )
  }
  const agencyAdminsForSelect = (agencyAdminsWithUser || [])
    .filter(a => !assignedAdminIds.has(String(a.id)))
    .map(a => ({ id: a.id, contact_name: a.contact_name ?? '', contact_email: a.contact_email ?? '' }))

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
        agencyAdminsForSelect={agencyAdminsForSelect}
        detailBasePath="/pages/admin/agencies"
      />
    </div>
  )
}
