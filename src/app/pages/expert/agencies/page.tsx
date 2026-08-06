import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import { getCachedAgenciesOrdered } from '@/lib/server-cache/reference-lists'
import AgenciesContent from '@/components/AgenciesContent'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'

export default async function ExpertAgenciesPage() {
  const session = await getSession()

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()
  const { data: agencies } = await getCachedAgenciesOrdered()
  const { data: agencyAdminsWithUser } = await q.getClientsWithCompanyOwner(supabaseAdmin)

  const referencedAdminIds: string[] = []
  for (const a of agencies || []) {
    for (const id of normalizeAgencyAdminIds(a.agency_admin_ids as string[] | string | null)) {
      referencedAdminIds.push(id)
    }
  }
  const uniqueReferenced = Array.from(new Set(referencedAdminIds))
  const withUserIdSet = new Set((agencyAdminsWithUser || []).map((r) => String(r.id)))
  const missingReferenced = uniqueReferenced.filter((id) => !withUserIdSet.has(id))
  const { data: extraAdmins } =
    missingReferenced.length > 0
      ? await q.getAgencyAdminsByIds(supabaseAdmin, missingReferenced)
      : { data: [] as { id: string; contact_name: string | null; contact_email: string | null }[] }

  const agencyAdminById = new Map<string, { id: string; contact_name: string; contact_email: string }>()
  for (const row of [...(agencyAdminsWithUser || []), ...(extraAdmins || [])]) {
    const id = String(row.id)
    if (!agencyAdminById.has(id)) {
      agencyAdminById.set(id, {
        id,
        contact_name: row.contact_name ?? '',
        contact_email: row.contact_email ?? '',
      })
    }
  }
  const agencyAdmins = Array.from(agencyAdminById.values()).sort((a, b) =>
    (a.contact_name || a.contact_email).localeCompare(b.contact_name || b.contact_email, undefined, { sensitivity: 'base' })
  )

  const assignedAdminIds = new Set<string>()
  for (const a of agencies || []) {
    normalizeAgencyAdminIds(a.agency_admin_ids as string[] | string | null).forEach((id) =>
      assignedAdminIds.add(String(id))
    )
  }
  const allAdmins = agencyAdminsWithUser || []
  const agencyAdminsForSelect = allAdmins.filter((a) => !assignedAdminIds.has(String(a.id)))

  return (
    <div className="space-y-4 md:space-y-6">
      <AgenciesContent
        agencies={agencies || []}
        agencyAdmins={agencyAdmins.map((a) => ({
          id: a.id,
          contact_name: a.contact_name ?? '',
          contact_email: a.contact_email ?? '',
        }))}
        agencyAdminsForSelect={agencyAdminsForSelect.map((a) => ({
          id: a.id,
          contact_name: a.contact_name ?? '',
          contact_email: a.contact_email ?? '',
        }))}
        detailBasePath="/pages/expert/agencies"
      />
    </div>
  )
}
