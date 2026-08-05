import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import ClientsContent from '@/components/ClientsContent'

const PAGE_SIZE = 50

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()

  const [{ data: profile }, { count: unreadNotifications }, params] = await Promise.all([
    q.getUserProfileFull(supabase, session.user.id),
    q.getUnreadNotificationsCount(supabase, session.user.id),
    searchParams,
  ])
  if (profile?.role === 'admin') redirect('/pages/admin')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')

  const page         = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search       = params.q ?? ''
  const statusFilter = params.status ?? 'all'

  // agency_id comes from the profile — no extra roundtrip needed
  const agencyId = (profile as { agency_id?: string | null } | null)?.agency_id ?? null

  const [clientsResult, counts] = agencyId
    ? await Promise.all([
        q.getPatientsByAgencyId(supabase, agencyId, { page, pageSize: PAGE_SIZE, search, status: statusFilter }),
        q.getPatientCountsByAgencyId(supabase, agencyId),
      ])
    : [{ data: [], count: 0, error: null }, { total: 0, active: 0 }]

  const clients = clientsResult.data ?? []
  const totalCount = clientsResult.count ?? 0

  return (
    <DashboardLayout
      user={session.user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    >
      <ClientsContent
        clients={clients}
        totalCount={totalCount}
        activeCount={counts.active}
        totalAllCount={counts.total}
        page={page}
        pageSize={PAGE_SIZE}
        search={search}
        statusFilter={statusFilter}
      />
    </DashboardLayout>
  )
}
