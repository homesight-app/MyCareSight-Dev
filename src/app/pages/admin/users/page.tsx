import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import { getCachedAgenciesIdName } from '@/lib/server-cache/reference-lists'
import AdminLayout from '@/components/AdminLayout'
import UserManagementTabs from '@/components/UserManagementTabs'
import { Users } from 'lucide-react'

export default async function UsersPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, user.id)
  const { data: userProfilesRaw } = await q.getUserProfilesOrderedByCreatedAt(supabase)
  type UserProfileRow = { id: string; role: string | null; [key: string]: unknown }
  const profilesList = (userProfilesRaw ?? []) as UserProfileRow[]

  type AgencyRow = { id: string; name: string | null }
  const { data: agenciesListData } = await getCachedAgenciesIdName()
  const agencies = (agenciesListData ?? []) as AgencyRow[]
  const agencyNameById: Record<string, string> = {}
  agencies.forEach(a => {
    if (a.id && a.name?.trim()) agencyNameById[a.id] = a.name.trim()
  })

  const companyOwnerIds = profilesList.filter(u => u.role === 'company_owner').map(u => u.id)
  type ClientCompanyRow = { user_id: string | null; company_owner_id: string | null; company_name: string | null; agency_id: string | null }
  const supabaseAdmin = createAdminClient()
  const [clientCompaniesByUserRes, clientCompaniesByOwnerRes] =
    companyOwnerIds.length > 0
      ? await Promise.all([
          supabaseAdmin
            .from('agency_admins')
            .select('user_id, company_owner_id, company_name, agency_id')
            .in('user_id', companyOwnerIds),
          supabaseAdmin
            .from('agency_admins')
            .select('user_id, company_owner_id, company_name, agency_id')
            .in('company_owner_id', companyOwnerIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]
  const clientCompanies = [
    ...((clientCompaniesByUserRes.data ?? []) as unknown as ClientCompanyRow[]),
    ...((clientCompaniesByOwnerRes.data ?? []) as unknown as ClientCompanyRow[]),
  ]
  const companyNameByUserId: Record<string, string> = {}
  clientCompanies.forEach(c => {
    const ownerUserId = c.user_id ?? c.company_owner_id
    if (!ownerUserId) return
    const name = c.agency_id && agencyNameById[c.agency_id]
      ? agencyNameById[c.agency_id]
      : (c.company_name?.trim() ?? null)
    if (name) companyNameByUserId[ownerUserId] = name
  })

  const staffUserIds = profilesList.filter(u => u.role === 'staff_member').map(u => u.id)
  type StaffMemberRow = { user_id: string; agency_id: string | null; company_owner_id: string | null }
  const { data: staffMembersData } =
    staffUserIds.length > 0 ? await q.getStaffMembersByUserIds(supabase, staffUserIds) : { data: [] }
  const staffMembers = (staffMembersData ?? []) as unknown as StaffMemberRow[]
  const clientIdsForStaff = staffMembers.map(s => s.company_owner_id).filter(Boolean) as string[]
  type ClientForStaffRow = { id: string; company_name: string | null; agency_id: string | null }
  const { data: clientsForStaffData } =
    clientIdsForStaff.length > 0
      ? await q.getClientsByIds(supabase, clientIdsForStaff, 'id, company_name, agency_id')
      : { data: [] }
  const clientsForStaff = (clientsForStaffData ?? []) as unknown as ClientForStaffRow[]
  const companyNameByClientId: Record<string, string> = {}
  clientsForStaff.forEach(c => {
    if (!c.id) return
    const name = c.agency_id && agencyNameById[c.agency_id]
      ? agencyNameById[c.agency_id]
      : (c.company_name?.trim() ?? null)
    if (name) companyNameByClientId[c.id] = name
  })
  const companyNameByStaffUserId: Record<string, string> = {}
  staffMembers.forEach(s => {
    if (!s.user_id) return
    const name = s.agency_id && agencyNameById[s.agency_id]
      ? agencyNameById[s.agency_id]
      : (s.company_owner_id ? companyNameByClientId[s.company_owner_id] : null)
    if (name) companyNameByStaffUserId[s.user_id] = name
  })

  const coordinatorUserIds = profilesList.filter(u => u.role === 'care_coordinator').map(u => u.id)
  type CareCoordinatorRow = { user_id: string; agency_id: string | null }
  const { data: coordinatorsData } =
    coordinatorUserIds.length > 0 ? await q.getCareCoordinatorsByUserIds(supabase, coordinatorUserIds) : { data: [] }
  const coordinators = (coordinatorsData ?? []) as unknown as CareCoordinatorRow[]
  const companyNameByCoordinatorUserId: Record<string, string> = {}
  coordinators.forEach(c => {
    if (!c.user_id || !c.agency_id) return
    const name = agencyNameById[c.agency_id]
    if (name) companyNameByCoordinatorUserId[c.user_id] = name
  })

  const userProfiles = profilesList.map(p => ({
    ...p,
    company_name: p.role === 'company_owner'
      ? (companyNameByUserId[p.id] ?? null)
      : p.role === 'staff_member'
        ? (companyNameByStaffUserId[p.id] ?? null)
        : p.role === 'care_coordinator'
          ? (companyNameByCoordinatorUserId[p.id] ?? null)
        : null,
  }))

  // Get user counts
  const totalUsers = userProfiles?.length || 0
  const activeUsers = userProfiles?.filter(u => u.role !== 'admin' || true).length || 0
  const disabledUsers = 0
  const companies = new Set(userProfiles?.map(u => (u as { company_name?: string | null }).company_name).filter(Boolean)).size

  const { data: clients } = await q.getAllClientsOrdered(supabase)
  const clientIds = (clients?.map((c) => c.id).filter(Boolean) ?? []) as string[]
  const expertIds = Array.from(
    new Set((clients ?? []).map((c) => c.expert_id).filter((id): id is string => Boolean(id)))
  )

  const [
    { data: clientStatesData },
    { data: casesData },
    { data: expertsForClients },
    { data: allExperts },
    { data: unreadRows, error: unreadRpcError },
  ] = await Promise.all([
    clientIds.length > 0 ? q.getClientStatesByClientIds(supabase, clientIds) : Promise.resolve({ data: [], error: null }),
    clientIds.length > 0
      ? q.getCasesByClientIds(supabase, clientIds, 'client_id, progress_percentage, status')
      : Promise.resolve({ data: [], error: null }),
    expertIds.length > 0 ? q.getLicensingExpertsByIds(supabase, expertIds, '*') : Promise.resolve({ data: [], error: null }),
    q.getLicensingExpertsActive(supabase),
    clientIds.length > 0
      ? q.rpcAdminUnreadMessageCountsByClient(supabase, user.id, clientIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (unreadRpcError) {
    console.error('admin_unread_message_counts_by_client RPC failed:', unreadRpcError.message)
  }

  const expertsByUserId: Record<string, unknown> = {}
  for (const e of (expertsForClients ?? []) as unknown as { user_id: string }[]) {
    if (e?.user_id) expertsByUserId[e.user_id] = e
  }

  type ClientStateRow = { client_id: string; state: string }
  const clientStates = (clientStatesData ?? []) as ClientStateRow[]

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

  type CaseRow = { client_id: string; progress_percentage: number; status: string }
  const cases = (casesData ?? []) as unknown as CaseRow[]

  // Calculate client statistics
  const totalClients = clients?.length || 0
  const activeApplications = cases?.length || 0
  const pendingReview = cases?.filter(c => c.status === 'under_review').length || 0

  const statesByClient: Record<string, string[]> = {}
  clientStates.forEach(cs => {
    if (!statesByClient[cs.client_id]) {
      statesByClient[cs.client_id] = []
    }
    statesByClient[cs.client_id].push(cs.state)
  })

  const casesByClient: Record<string, any[]> = {}
  cases.forEach(c => {
    if (!casesByClient[c.client_id]) {
      casesByClient[c.client_id] = []
    }
    casesByClient[c.client_id].push(c)
  })

  type LicensingExpertRow = { id: string; status?: string; [key: string]: unknown }
  const { data: allExpertsDataRaw } = await q.getLicensingExpertsOrdered(supabase)
  const allExpertsData = (allExpertsDataRaw ?? []) as LicensingExpertRow[]
  const licensingExpertIds = allExpertsData.map((e) => e.id)
  type ExpertStateRow = { expert_id: string; state: string }
  const { data: expertStatesData } =
    licensingExpertIds.length > 0
      ? await q.getExpertStatesByExpertIds(supabase, licensingExpertIds)
      : { data: [] }
  const expertStates = (expertStatesData ?? []) as ExpertStateRow[]
  const { data: expertClientsData } = await q.getClientsByExpertIds(supabase, licensingExpertIds)
  const expertClients = (expertClientsData ?? []) as { expert_id: string }[]
  const totalExperts = allExpertsData.length
  const activeExperts = allExpertsData.filter(e => e.status === 'active').length
  const assignedClients = expertClients.length

  const statesByExpert: Record<string, string[]> = {}
  expertStates.forEach(es => {
    if (!statesByExpert[es.expert_id]) {
      statesByExpert[es.expert_id] = []
    }
    statesByExpert[es.expert_id].push(es.state)
  })

  const clientsByExpert: Record<string, number> = {}
  expertClients.forEach(c => {
    if (c.expert_id) {
      clientsByExpert[c.expert_id] = (clientsByExpert[c.expert_id] || 0) + 1
    }
  })

  return (
    <AdminLayout 
      user={user} 
      profile={profile} 
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-4 md:space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2 md:gap-3">
            <Users className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
            <span className="break-words">User Management</span>
          </h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">Manage users, clients, and licensing experts</p>
        </div>

        {/* Tabbed Content */}
        <UserManagementTabs
          userProfiles={userProfiles || []}
          totalUsers={totalUsers}
          activeUsers={activeUsers}
          disabledUsers={disabledUsers}
          companies={companies}
          clients={clients || []}
          agencies={agencies.map((a) => ({ id: a.id, name: a.name ?? '' }))}
          expertsByUserId={expertsByUserId}
          allExperts={allExperts || []}
          statesByClient={statesByClient}
          casesByClient={casesByClient}
          unreadMessagesByClient={unreadMessagesByClient}
          totalClients={totalClients}
          activeApplications={activeApplications}
          pendingReview={pendingReview}
          unreadMessagesCount={unreadMessagesCount}
          experts={allExpertsData || []}
          statesByExpert={statesByExpert}
          clientsByExpert={clientsByExpert}
          totalExperts={totalExperts}
          activeExperts={activeExperts}
          assignedClients={assignedClients}
        />
      </div>
    </AdminLayout>
  )
}

