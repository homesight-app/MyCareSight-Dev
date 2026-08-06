import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ClientListWithFilters from '@/components/ClientListWithFilters'
import { Building2, CheckCircle2, Clock, MessageSquare } from 'lucide-react'

const PAGE_SIZE = 50

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { user } = await requireAdmin()
  const params = await searchParams
  const page   = Math.max(0, parseInt(params.page ?? '0') || 0)

  const supabase = await createClient()

  const [
    clientsResult,
    { count: activeAppCount },
    { count: pendingCount },
    { data: allExperts },
    { data: allClientIdRows },
  ] = await Promise.all([
    q.getAllClientsOrderedPaginated(supabase, page, PAGE_SIZE),
    supabase.from('applications').select('id', { count: 'exact', head: true }).in('status', ['requested', 'in_progress', 'under_review', 'needs_revision']),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'under_review'),
    q.getLicensingExpertsActive(supabase),
    supabase.from('agency_admins').select('id'),
  ])

  const clients    = clientsResult.data ?? []
  const clientIds  = clients.map((c) => c.id).filter(Boolean) as string[]
  const totalCount = clientsResult.count ?? 0

  const expertIds = Array.from(
    new Set(clients.map((c) => c.expert_id).filter((id): id is string => Boolean(id)))
  )

  const [
    { data: clientStates },
    { data: casesData },
    { data: expertsForClients },
    { data: unreadRows, error: unreadRpcError },
  ] = await Promise.all([
    clientIds.length > 0 ? q.getClientStatesByClientIds(supabase, clientIds) : Promise.resolve({ data: [], error: null }),
    clientIds.length > 0
      ? q.getCasesByClientIds(supabase, clientIds, 'client_id, progress_percentage, status')
      : Promise.resolve({ data: [], error: null }),
    expertIds.length > 0 ? q.getLicensingExpertsByIds(supabase, expertIds, '*') : Promise.resolve({ data: [], error: null }),
    // Unread stat: use all client IDs for the global count
    (allClientIdRows ?? []).length > 0
      ? q.rpcAdminUnreadMessageCountsByClient(supabase, user.id, (allClientIdRows ?? []).map(r => r.id))
      : Promise.resolve({ data: [], error: null }),
  ])

  if (unreadRpcError) {
    console.error('admin_unread_message_counts_by_client RPC failed:', unreadRpcError.message)
  }

  type ExpertRow = { user_id: string; first_name: string; last_name: string }
  const expertsByUserId: Record<string, ExpertRow> = {}
  for (const e of (expertsForClients ?? []) as unknown as ExpertRow[]) {
    if (e?.user_id) expertsByUserId[e.user_id] = e
  }

  type UnreadRow = { client_id: string; unread_count: number | string }
  const unreadMessagesByClient: Record<string, number> = {}
  let unreadMessagesCount = 0
  for (const row of (unreadRows ?? []) as UnreadRow[]) {
    const cid = row.client_id
    const n = Number(row.unread_count ?? 0)
    if (!cid || !Number.isFinite(n) || n <= 0) continue
    unreadMessagesByClient[cid] = (unreadMessagesByClient[cid] || 0) + n
    unreadMessagesCount += n
  }

  const cases = casesData as { client_id: string; progress_percentage: number; status: string }[] | null

  type ClientStateRow = { client_id: string; state: string }
  const statesByClient: Record<string, string[]> = {}
  ;(clientStates as ClientStateRow[] | null)?.forEach((cs) => {
    if (!statesByClient[cs.client_id]) statesByClient[cs.client_id] = []
    statesByClient[cs.client_id].push(cs.state)
  })

  const casesByClient: Record<string, unknown[]> = {}
  cases?.forEach((c: { client_id: string }) => {
    if (!casesByClient[c.client_id]) casesByClient[c.client_id] = []
    casesByClient[c.client_id].push(c)
  })

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{totalCount}</div>
          <div className="text-xs md:text-sm text-gray-600">Total Clients</div>
        </div>

        <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{activeAppCount ?? 0}</div>
          <div className="text-xs md:text-sm text-gray-600">Active Applications</div>
        </div>

        <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 md:w-6 md:h-6 text-yellow-600" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{pendingCount ?? 0}</div>
          <div className="text-xs md:text-sm text-gray-600">Pending Review</div>
        </div>

        <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{unreadMessagesCount}</div>
          <div className="text-xs md:text-sm text-gray-600">Unread Messages</div>
        </div>
      </div>

      <ClientListWithFilters
        clients={clients}
        totalCount={totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        expertsByUserId={expertsByUserId}
        allExperts={allExperts || []}
        statesByClient={statesByClient}
        casesByClient={casesByClient}
        unreadMessagesByClient={unreadMessagesByClient}
      />
    </div>
  )
}
