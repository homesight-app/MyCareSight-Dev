import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import { getCachedAgenciesOrdered } from '@/lib/server-cache/reference-lists'
import AdminLayout from '@/components/AdminLayout'
import AgenciesContent from '@/components/AgenciesContent'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'

export default async function AgenciesPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, user.id)
  const { data: agencies } = await getCachedAgenciesOrdered()
  // agency_admins RLS does not expose rows to platform admins — use service role (same as cached agencies).
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

  // One agency admin can only be in one agency: show only those not in any agency's agency_admin_ids
  const assignedAdminIds = new Set<string>()
  for (const a of agencies || []) {
    normalizeAgencyAdminIds(a.agency_admin_ids as string[] | string | null).forEach((id) =>
      assignedAdminIds.add(String(id))
    )
  }
  const allAdmins = agencyAdminsWithUser || []
  const agencyAdminsForSelect = allAdmins.filter((a) => !assignedAdminIds.has(String(a.id)))

  return (
    <AdminLayout
      user={user}
      profile={profile}
      unreadNotifications={unreadNotifications || 0}
    >
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
          detailBasePath="/pages/admin/agencies"
        />
      </div>
    </AdminLayout>
  )
}
