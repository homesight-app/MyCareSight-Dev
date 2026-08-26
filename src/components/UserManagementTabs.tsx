'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Users, Building2, Briefcase, CheckCircle2, Clock, MessageSquare, Search, Filter,
} from 'lucide-react'
import ClientListWithFilters from './ClientListWithFilters'
import ExpertListWithFilters from './ExpertListWithFilters'
import ResetPasswordModal from './ResetPasswordModal'
import AddExpertModal from './AddExpertModal'
import AddUserModal from './AddUserModal'
import AddNewClientModal from './AddNewClientModal'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import TablePagination from '@/components/ui/TablePagination'
import { useTableState } from '@/hooks/useTableState'
import { toggleUserStatus } from '@/app/actions/users'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'

type TabType = 'users' | 'clients' | 'experts'
type UserTabKey = 'active' | 'inactive'

interface UserManagementTabsProps {
  userProfiles: any[]
  totalUsers: number
  activeUsers: number
  disabledUsers: number
  companies: number
  clients: any[]
  agencies: { id: string; name: string }[]
  expertsByUserId: Record<string, any>
  allExperts: any[]
  statesByClient: Record<string, string[]>
  casesByClient: Record<string, any[]>
  unreadMessagesByClient: Record<string, number>
  totalClients: number
  activeApplications: number
  pendingReview: number
  unreadMessagesCount: number
  experts: any[]
  statesByExpert: Record<string, string[]>
  clientsByExpert: Record<string, number>
  totalExperts: number
  activeExperts: number
  assignedClients: number
}

function getRoleDisplayLabel(role: string): string {
  switch (role) {
    case 'admin': return 'Admin'
    case 'company_owner': return 'Agency admin'
    case 'expert': return 'Expert'
    case 'staff_member': return 'Caregiver'
    case 'care_coordinator': return 'Care Coordinator'
    default: return role || '—'
  }
}

function getCompanyDisplay(profile: { company_name?: string | null }): string {
  return profile.company_name?.trim() || '—'
}

function formatDate(date: string | Date | null): string {
  if (!date) return 'N/A'
  const d = typeof date === 'string'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date))
    : date
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function RoleBadge({ role }: { role: string }) {
  const label = getRoleDisplayLabel(role)
  if (role === 'admin') {
    return (
      <span className="px-2 py-1 bg-black text-white text-xs font-semibold rounded-full flex items-center justify-center gap-1">
        <span className="w-2 h-2 bg-white rounded-full" />
        {label}
      </span>
    )
  }
  const cls: Record<string, string> = {
    company_owner: 'bg-blue-100 text-blue-800',
    expert: 'bg-amber-100 text-amber-800',
    care_coordinator: 'bg-teal-100 text-teal-800',
    staff_member: 'bg-gray-100 text-gray-700',
  }
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full flex items-center justify-center ${cls[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
      {isActive ? 'Active' : 'Disabled'}
    </span>
  )
}

export default function UserManagementTabs({
  userProfiles,
  totalUsers,
  activeUsers,
  disabledUsers,
  companies,
  clients,
  agencies = [],
  expertsByUserId,
  allExperts,
  statesByClient,
  casesByClient,
  unreadMessagesByClient,
  totalClients,
  activeApplications,
  pendingReview,
  unreadMessagesCount,
  experts,
  statesByExpert,
  clientsByExpert,
  totalExperts,
  activeExperts,
  assignedClients,
}: UserManagementTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('users')
  const [userTab, setUserTab] = useState<UserTabKey>('active')

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('All Roles')
  const [groupByCompany, setGroupByCompany] = useState(false)

  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null)
  const [userStatuses, setUserStatuses] = useState<Record<string, boolean>>({})
  const [isTogglingStatus, setIsTogglingStatus] = useState<string | null>(null)
  const [isAddExpertModalOpen, setIsAddExpertModalOpen] = useState(false)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'users'
  useEffect(() => { setActiveTab(tab as TabType) }, [tab])

  useMemo(() => {
    setUserStatuses(prev => {
      const statuses: Record<string, boolean> = { ...prev }
      userProfiles.forEach(profile => {
        if (!(profile.id in statuses)) {
          statuses[profile.id] = true
        }
      })
      return statuses
    })
  }, [userProfiles])

  const {
    sort: userSort,
    setSort: setUserSort,
    page: userPage,
    setPage: setUserPage,
    pageSize: userPageSize,
    resetPage: resetUserPage,
    applySortedData: applyUserSortedData,
    applyPageSlice: applyUserPageSlice,
  } = useTableState({ defaultSort: { key: 'name', dir: 'asc' } })

  const handleUserTabChange = (newTab: UserTabKey) => {
    if (newTab === userTab) return
    setUserTab(newTab)
    resetUserPage()
  }

  const disabledCount = useMemo(
    () => userProfiles.filter(p => userStatuses[p.id] === false).length,
    [userProfiles, userStatuses]
  )

  const userSortFn = useCallback((key: string, dir: 'asc' | 'desc') => (a: any, b: any): number => {
    let aVal: string, bVal: string
    if (key === 'name') {
      aVal = a.full_name || a.email || ''
      bVal = b.full_name || b.email || ''
    } else if (key === 'role') {
      aVal = getRoleDisplayLabel(a.role)
      bVal = getRoleDisplayLabel(b.role)
    } else if (key === 'company') {
      aVal = getCompanyDisplay(a)
      bVal = getCompanyDisplay(b)
    } else {
      return 0
    }
    return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
  }, [])

  const filteredUsers = useMemo(() => {
    return userProfiles.filter(profile => {
      const isActive = userStatuses[profile.id] !== false
      if (userTab === 'active' && !isActive) return false
      if (userTab === 'inactive' && isActive) return false

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          (profile.full_name && profile.full_name.toLowerCase().includes(query)) ||
          profile.email.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      if (selectedRole !== 'All Roles') {
        const roleToDb: Record<string, string> = {
          'Admin': 'admin',
          'Agency admin': 'company_owner',
          'Expert': 'expert',
          'Caregiver': 'staff_member',
          'Care Coordinator': 'care_coordinator',
        }
        if (profile.role !== roleToDb[selectedRole]) return false
      }

      return true
    })
  }, [userProfiles, searchQuery, selectedRole, userStatuses, userTab])

  const sortedUsers = useMemo(
    () => applyUserSortedData(filteredUsers, userSortFn),
    [filteredUsers, applyUserSortedData, userSortFn]
  )

  const { slice: pagedUsers, totalCount: userTotalCount } = useMemo(
    () => applyUserPageSlice(sortedUsers),
    [sortedUsers, applyUserPageSlice]
  )

  const usersByCompany = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    sortedUsers.forEach(user => {
      const company = getCompanyDisplay(user)
      if (!grouped[company]) grouped[company] = []
      grouped[company].push(user)
    })
    return grouped
  }, [sortedUsers])

  const handleToggleStatus = async (userId: string) => {
    if (isTogglingStatus === userId) return
    setIsTogglingStatus(userId)
    const currentStatus = userStatuses[userId] !== false
    const newStatus = !currentStatus
    try {
      const result = await toggleUserStatus(userId, newStatus)
      if (result.error) {
        alert(`Failed to ${newStatus ? 'enable' : 'disable'} user: ${result.error}`)
      } else {
        setUserStatuses(prev => ({ ...prev, [userId]: newStatus }))
      }
    } catch (err: any) {
      alert(`Failed to ${newStatus ? 'enable' : 'disable'} user: ${err.message}`)
    } finally {
      setIsTogglingStatus(null)
    }
  }

  const handleOpenResetPassword = (user: { id: string; name: string; email: string }) => {
    setSelectedUser(user)
    setResetPasswordModalOpen(true)
  }

  const userTableHeaders = (
    <tr className="border-b border-gray-100 bg-gray-50/60">
      <th className="w-10 px-2 py-2.5" />
      <SortableColumnHeader label="Name" sortKey="name" currentSort={userSort} onSort={setUserSort} />
      <SortableColumnHeader label="Company" sortKey="company" currentSort={userSort} onSort={setUserSort} className="hidden sm:table-cell" />
      <SortableColumnHeader label="Role" sortKey="role" currentSort={userSort} onSort={setUserSort} />
      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Licenses</th>
      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Last Login</th>
    </tr>
  )

  const renderUserRow = (userProfile: any, index: number) => {
    const isActive = userStatuses[userProfile.id] !== false
    const originalIndex = userProfiles.indexOf(userProfile)
    const userID = `USR-${String(originalIndex + 1).padStart(3, '0')}`
    return (
      <tr key={userProfile.id} className={`hover:bg-gray-50/50 transition-colors ${!isActive ? 'opacity-60' : ''}`}>
        <td className="w-10 px-2 py-3">
          <RecordActionsMenu
            label={`Actions for ${userProfile.full_name || userProfile.email}`}
            actions={[
              {
                label: 'Reset Password',
                onClick: () => handleOpenResetPassword({
                  id: userProfile.id,
                  name: userProfile.full_name || 'N/A',
                  email: userProfile.email,
                }),
              },
              {
                label: isActive ? 'Disable Account' : 'Enable Account',
                onClick: () => handleToggleStatus(userProfile.id),
                destructive: isActive,
                hidden: isTogglingStatus === userProfile.id,
              },
            ]}
          />
        </td>
        <td className="px-4 py-3">
          <div className="text-sm font-medium text-gray-900">{userProfile.full_name || 'N/A'}</div>
          <div className="text-xs text-gray-500">{userProfile.email}</div>
          <div className="text-xs text-blue-500 mt-0.5">{userID}</div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 hidden sm:table-cell">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            {getCompanyDisplay(userProfile)}
          </div>
        </td>
        <td className="px-4 py-3">
          <RoleBadge role={userProfile.role} />
        </td>
        <td className="px-4 py-3">
          <UserStatusBadge isActive={isActive} />
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
          {userProfile.role === 'company_owner' ? '1' : '0'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 hidden lg:table-cell">
          {formatDate(userProfile.updated_at)}
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Main tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-4" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab('experts')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'experts'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Experts
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'users' && (
          <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Users</h2>
                <p className="text-sm md:text-base text-gray-600 mt-1">Manage platform users and access.</p>
              </div>
              <button
                onClick={() => setIsAddUserModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm md:text-base whitespace-nowrap"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" />
                Add User
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{totalUsers}</div>
                <div className="text-xs md:text-sm text-gray-600">All registered users</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{activeUsers}</div>
                <div className="text-xs md:text-sm text-gray-600">Currently enabled</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{disabledUsers}</div>
                <div className="text-xs md:text-sm text-gray-600">Access revoked</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{companies}</div>
                <div className="text-xs md:text-sm text-gray-600">Unique organizations</div>
              </div>
            </div>

            {/* Active / Inactive tabs + Search + Filters */}
            <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-3">
                {/* Active/Inactive tabs */}
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg self-start">
                  <button
                    type="button"
                    onClick={() => handleUserTabChange('active')}
                    aria-pressed={userTab === 'active'}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${userTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUserTabChange('inactive')}
                    aria-pressed={userTab === 'inactive'}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${userTab === 'inactive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Inactive{disabledCount > 0 ? ` (${disabledCount})` : ''}
                  </button>
                </div>
                <button
                  onClick={() => setGroupByCompany(!groupByCompany)}
                  className={`px-3 py-2 text-sm border rounded-lg transition-colors flex items-center gap-2 ${
                    groupByCompany
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Group by Company
                </button>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
                  />
                </div>
                <button className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center">
                  <Filter className="w-4 h-4 text-gray-600" />
                </button>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
                >
                  <option>All Roles</option>
                  <option>Admin</option>
                  <option>Agency admin</option>
                  <option>Expert</option>
                  <option>Caregiver</option>
                  <option>Care Coordinator</option>
                </select>
              </div>
            </div>

            {/* User Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                {groupByCompany ? (
                  Object.keys(usersByCompany).length === 0 ? (
                    <p className="px-5 py-8 text-sm text-gray-400 italic text-center">No users match your search.</p>
                  ) : (
                    Object.entries(usersByCompany).map(([company, users]) => (
                      <div key={company} className="border-b border-gray-100 last:border-b-0">
                        <div className="bg-gray-50/80 px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          <span className="text-xs font-semibold text-gray-700">{company}</span>
                          <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-full">
                            {users.length} {users.length === 1 ? 'user' : 'users'}
                          </span>
                        </div>
                        <table className="w-full">
                          <thead>
                            {userTableHeaders}
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {users.map((u, i) => renderUserRow(u, i))}
                          </tbody>
                        </table>
                      </div>
                    ))
                  )
                ) : pagedUsers.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 italic text-center">
                    {userProfiles.length === 0 ? 'No users found.' : 'No users match your search.'}
                  </p>
                ) : (
                  <table className="w-full">
                    <thead>
                      {userTableHeaders}
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pagedUsers.map((u, i) => renderUserRow(u, i))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {!groupByCompany && (
              <TablePagination
                page={userPage}
                pageSize={userPageSize}
                totalCount={userTotalCount}
                onPageChange={setUserPage}
                entityLabel="users"
              />
            )}
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Agency Admins</h2>
                <p className="text-sm md:text-base text-gray-600 mt-1">Manage your care recipients and applications.</p>
              </div>
              <button
                onClick={() => setIsAddClientModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm md:text-base whitespace-nowrap"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" />
                Add New Agency Admin
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
                <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{totalClients}</div>
                <div className="text-xs md:text-sm text-gray-600">Total Agency Admins</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                </div>
                <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{activeApplications}</div>
                <div className="text-xs md:text-sm text-gray-600">Active Applications</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <Clock className="w-5 h-5 md:w-6 md:h-6 text-yellow-600" />
                </div>
                <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{pendingReview}</div>
                <div className="text-xs md:text-sm text-gray-600">Pending Review</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                </div>
                <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{unreadMessagesCount}</div>
                <div className="text-xs md:text-sm text-gray-600">Unread Messages</div>
              </div>
            </div>
            <ClientListWithFilters
              clients={clients || []}
              totalCount={clients?.length ?? 0}
              page={0}
              pageSize={clients?.length ?? 50}
              expertsByUserId={expertsByUserId}
              allExperts={allExperts || []}
              statesByClient={statesByClient}
              casesByClient={casesByClient}
              unreadMessagesByClient={unreadMessagesByClient}
            />
          </div>
        )}

        {activeTab === 'experts' && (
          <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Licensing Experts</h2>
                <p className="text-sm md:text-base text-gray-600 mt-1">Manage your team of licensing consultants and specialists.</p>
              </div>
              <button
                onClick={() => setIsAddExpertModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm md:text-base whitespace-nowrap"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" />
                Add Expert
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{totalExperts}</div>
                <div className="text-xs md:text-sm text-gray-600">Total Experts</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{activeExperts}</div>
                <div className="text-xs md:text-sm text-gray-600">Active Experts</div>
              </div>
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3 md:mb-4">
                  <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{assignedClients}</div>
                <div className="text-xs md:text-sm text-gray-600">Assigned Clients</div>
              </div>
            </div>
            <ExpertListWithFilters
              experts={experts || []}
              statesByExpert={statesByExpert}
              clientsByExpert={clientsByExpert}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedUser && (
        <ResetPasswordModal
          isOpen={resetPasswordModalOpen}
          onClose={() => { setResetPasswordModalOpen(false); setSelectedUser(null) }}
          userName={selectedUser.name}
          userEmail={selectedUser.email}
          userId={selectedUser.id}
        />
      )}
      <AddExpertModal
        isOpen={isAddExpertModalOpen}
        onClose={() => setIsAddExpertModalOpen(false)}
        onSuccess={() => { setIsAddExpertModalOpen(false); router.refresh() }}
      />
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        onSuccess={() => { setIsAddUserModalOpen(false); router.refresh() }}
        agencies={agencies}
      />
      <AddNewClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onSuccess={() => { setIsAddClientModalOpen(false); router.refresh() }}
        mode="agency_admin"
      />
    </div>
  )
}
