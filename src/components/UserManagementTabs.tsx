'use client'

import { useState, useMemo, useEffect } from 'react'
import { Users, Building2, Briefcase, CheckCircle2, Clock, MessageSquare, Search, Filter, Settings, UserX, UserCheck } from 'lucide-react'
import ClientListWithFilters from './ClientListWithFilters'
import ExpertListWithFilters from './ExpertListWithFilters'
import ResetPasswordModal from './ResetPasswordModal'
import AddExpertModal from './AddExpertModal'
import AddUserModal from './AddUserModal'
import AddNewClientModal from './AddNewClientModal'
import { toggleUserStatus } from '@/app/actions/users'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'

type TabType = 'users' | 'clients' | 'experts'

interface UserManagementTabsProps {
  // Users data
  userProfiles: any[]
  totalUsers: number
  activeUsers: number
  disabledUsers: number
  companies: number
  
  // Clients data
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
  
  // Experts data
  experts: any[]
  statesByExpert: Record<string, string[]>
  clientsByExpert: Record<string, number>
  totalExperts: number
  activeExperts: number
  assignedClients: number
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
  assignedClients
}: UserManagementTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('users')
  
  // Filter states for Users tab
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('All Roles')
  const [selectedStatus, setSelectedStatus] = useState('All Status')
  const [groupByCompany, setGroupByCompany] = useState(false)
  
  // Modal and user action states
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
  useEffect(() => {
    setActiveTab(tab as TabType)
  }, [tab])

  // Initialize user statuses (all active by default, but preserve existing changes)
  useMemo(() => {
    setUserStatuses(prev => {
      const statuses: Record<string, boolean> = { ...prev }
      // Only set status for users that don't have a status yet
      userProfiles.forEach(profile => {
        if (!(profile.id in statuses)) {
          statuses[profile.id] = true // All users are active by default
        }
      })
      return statuses
    })
  }, [userProfiles])

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  // DB role -> display label (admin, agency admin, expert, caregiver)
  const getRoleDisplayLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Admin'
      case 'company_owner': return 'Agency admin'
      case 'expert': return 'Expert'
      case 'staff_member': return 'Caregiver'
      case 'care_coordinator': return 'Care Coordinator'
      default: return role || '—'
    }
  }

  const getRoleBadge = (role: string) => {
    const label = getRoleDisplayLabel(role)
    if (role === 'admin') {
      return (
        <span className="px-2 py-1 bg-black text-white text-xs font-semibold rounded-full flex items-center justify-center gap-1">
          <span className="w-2 h-2 bg-white rounded-full"></span>
          {label}
        </span>
      )
    }
    if (role === 'company_owner') {
      return (
        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full flex items-center justify-center">
          {label}
        </span>
      )
    }
    if (role === 'expert') {
      return (
        <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full flex items-center justify-center">
          {label}
        </span>
      )
    }
    if (role === 'staff_member') {
      return (
        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full flex items-center justify-center">
          {label}
        </span>
      )
    }
    if (role === 'care_coordinator') {
      return (
        <span className="px-2 py-1 bg-teal-100 text-teal-800 text-xs font-semibold rounded-full flex items-center justify-center">
          {label}
        </span>
      )
    }
    return (
      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full flex items-center justify-center">
        {label}
      </span>
    )
  }

  const getStatusBadge = (userId: string) => {
    const isActive = userStatuses[userId] !== false // Default to true if not set
    if (isActive) {
      return (
        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full flex items-center gap-1">
          <span className="w-2 h-2 bg-green-600 rounded-full"></span>
          active
        </span>
      )
    }
    return (
      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full flex items-center gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
        disabled
      </span>
    )
  }

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
        // Update local state
        setUserStatuses(prev => ({
          ...prev,
          [userId]: newStatus
        }))
        // Don't refresh - just update counts locally if needed
        // router.refresh() would reset the userStatuses state
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

  const handleCloseResetPassword = () => {
    setResetPasswordModalOpen(false)
    setSelectedUser(null)
  }

  const getCompanyDisplay = (profile: { company_name?: string | null; email?: string }) => {
    if (profile.company_name?.trim()) return profile.company_name.trim()
    return '—'
  }



  // Filter users based on search and filters
  const filteredUsers = useMemo(() => {
    
    return userProfiles.filter(profile => {
      // Search filter (name, email, user ID)
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const userID = `USR-${String(userProfiles.indexOf(profile) + 1).padStart(3, '0')}`
        const matchesSearch = 
          (profile.full_name && profile.full_name.toLowerCase().includes(query)) ||
          profile.email.toLowerCase().includes(query) ||
          userID.toLowerCase().includes(query)
        
        if (!matchesSearch) return false
      }

      // Role filter (selectedRole is display label: Admin, Agency admin, Expert, Caregiver)
      if (selectedRole !== 'All Roles') {
        const roleToDb: Record<string, string> = {
          'Admin': 'admin',
          'Agency admin': 'company_owner',
          'Expert': 'expert',
          'Caregiver': 'staff_member',
          'Care Coordinator': 'care_coordinator',
        }
        const wantedDbRole = roleToDb[selectedRole]
        if (profile.role !== wantedDbRole) return false
      }

      // Status filter
      if (selectedStatus !== 'All Status') {
        const isActive = userStatuses[profile.id] !== false
        if (selectedStatus === 'Active' && !isActive) return false
        if (selectedStatus === 'Disabled' && isActive) return false
      }

      return true
    })
  }, [userProfiles, searchQuery, selectedRole, selectedStatus, userStatuses])

  // Group users by company (exact company name when available)
  const usersByCompany = useMemo(() => {
    const grouped: Record<string, typeof filteredUsers> = {}
    filteredUsers.forEach(user => {
      const company = getCompanyDisplay(user) || '—'
      if (!grouped[company]) {
        grouped[company] = []
      }
      grouped[company].push(user)
    })
    return grouped
  }, [filteredUsers])

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Tabs */}
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
          {/* <button
            onClick={() => setActiveTab('clients')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'clients'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Agency Admin
          </button> */}
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
            {/* Header with Add User Button */}
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
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{totalUsers}</div>
                <div className="text-xs md:text-sm text-gray-600">All registered users</div>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{activeUsers}</div>
                <div className="text-xs md:text-sm text-gray-600">Currently enabled</div>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{disabledUsers}</div>
                <div className="text-xs md:text-sm text-gray-600">Access revoked</div>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{companies}</div>
                <div className="text-xs md:text-sm text-gray-600">Unique organizations</div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Search Input */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by name, email, company, or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
                  />
                </div>
                {/* Filter Icon Button */}
                <button className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center">
                  <Filter className="w-4 h-4 text-gray-600" />
                </button>
                {/* Role Dropdown */}
                <select 
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
                >
                  <option>All Roles</option>
                  <option>Admin</option>
                  <option>Agency admin</option>
                  <option>Expert</option>
                  <option>Caregiver</option>
                  <option>Care Coordinator</option>
                </select>
                {/* Status Dropdown */}
                <select 
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
                >
                  <option>All Status</option>
                  <option>Active</option>
                  <option>Disabled</option>
                </select>
                {/* Group by Company Button */}
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
            </div>

            {/* User Table */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                {groupByCompany ? (
                  // Grouped by Company View
                  Object.entries(usersByCompany).map(([company, users]) => (
                    <div key={company} className="border-b border-gray-200 last:border-b-0">
                      {/* Company Header */}
                      <div className="bg-gray-50 px-3 md:px-6 py-3 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-600" />
                          <span className="text-sm font-semibold text-gray-900">{company}</span>
                          <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-full">
                            {users.length} {users.length === 1 ? 'user' : 'users'}
                          </span>
                        </div>
                      </div>
                      {/* Users Table for this Company */}
                      <table className="w-full min-w-[800px]">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">User ID</th>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Name & Email</th>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell">Company</th>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Role</th>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell">Licenses</th>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                            <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {users.map((userProfile) => {
                            const isActive = userStatuses[userProfile.id] !== false
                            const originalIndex = userProfiles.indexOf(userProfile)
                            const userID = `USR-${String(originalIndex + 1).padStart(3, '0')}`

                            return (
                              <tr key={userProfile.id} className="hover:bg-gray-50">
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm font-medium text-blue-600">{userID}</td>
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                  <div>
                                    <div className="text-xs md:text-sm font-medium text-gray-900">{userProfile.full_name || 'N/A'}</div>
                                    <div className="text-xs md:text-sm text-gray-500 break-all">{userProfile.email}</div>
                                  </div>
                                </td>
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="w-3 h-3 md:w-4 md:h-4 text-gray-400" />
                                    <span className="text-xs md:text-sm text-gray-900">{getCompanyDisplay(userProfile)}</span>
                                  </div>
                                </td>
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                  {getRoleBadge(userProfile.role)}
                                </td>
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                  {getStatusBadge(userProfile.id)}
                                </td>
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden md:table-cell">
                                  {userProfile.role === 'company_owner' ? '1' : '0'}
                                </td>
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden lg:table-cell">
                                  {formatDate(userProfile.updated_at)}
                                </td>
                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm">
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => handleToggleStatus(userProfile.id)}
                                      disabled={isTogglingStatus === userProfile.id}
                                      className={`${isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'} disabled:opacity-50`}
                                      title={isActive ? 'Disable' : 'Enable'}
                                    >
                                      {isActive ? (
                                        <UserX className="w-4 h-4 md:w-5 md:h-5" />
                                      ) : (
                                        <UserCheck className="w-4 h-4 md:w-5 md:h-5" />
                                      )}
                                    </button>
                                    <button 
                                      onClick={() => handleOpenResetPassword({
                                        id: userProfile.id,
                                        name: userProfile.full_name || 'N/A',
                                        email: userProfile.email
                                      })}
                                      className="text-blue-600 hover:text-blue-800"
                                      title="Settings"
                                    >
                                      <Settings className="w-4 h-4 md:w-5 md:h-5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))
                ) : (
                  // Regular Table View
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">User ID</th>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Name & Email</th>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell">Company</th>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Role</th>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell">Licenses</th>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                        <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers && filteredUsers.length > 0 ? (
                        filteredUsers.map((userProfile, index) => {
                          const isActive = userStatuses[userProfile.id] !== false
                          const originalIndex = userProfiles.indexOf(userProfile)
                          const userID = `USR-${String(originalIndex + 1).padStart(3, '0')}`

                          return (
                            <tr key={userProfile.id} className="hover:bg-gray-50">
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm font-medium text-blue-600">{userID}</td>
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-xs md:text-sm font-medium text-gray-900">{userProfile.full_name || 'N/A'}</div>
                                  <div className="text-xs md:text-sm text-gray-500 break-all">{userProfile.email}</div>
                                </div>
                              </td>
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-3 h-3 md:w-4 md:h-4 text-gray-400" />
                                  <span className="text-xs md:text-sm text-gray-900">{getCompanyDisplay(userProfile)}</span>
                                </div>
                              </td>
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                {getRoleBadge(userProfile.role)}
                              </td>
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                {getStatusBadge(userProfile.id)}
                              </td>
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden md:table-cell">
                                {userProfile.role === 'company_owner' ? '1' : '0'}
                              </td>
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden lg:table-cell">
                                {formatDate(userProfile.updated_at)}
                              </td>
                              <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm">
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => handleToggleStatus(userProfile.id)}
                                    disabled={isTogglingStatus === userProfile.id}
                                    className={`${isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'} disabled:opacity-50`}
                                    title={isActive ? 'Disable' : 'Enable'}
                                  >
                                    {isActive ? (
                                      <UserX className="w-4 h-4 md:w-5 md:h-5" />
                                    ) : (
                                      <UserCheck className="w-4 h-4 md:w-5 md:h-5" />
                                    )}
                                  </button>
                                  <button 
                                    onClick={() => handleOpenResetPassword({
                                      id: userProfile.id,
                                      name: userProfile.full_name || 'N/A',
                                      email: userProfile.email
                                    })}
                                    className="text-blue-600 hover:text-blue-800"
                                    title="Settings"
                                  >
                                    <Settings className="w-4 h-4 md:w-5 md:h-5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                            {userProfiles.length === 0 ? 'No users found' : 'No users match your search criteria'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="space-y-4 md:space-y-6">
            {/* Header with Add Client Button */}
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
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{totalClients}</div>
                <div className="text-xs md:text-sm text-gray-600">Total Agency Admins</div>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
                <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{activeApplications}</div>
                <div className="text-xs md:text-sm text-gray-600">Active Applications</div>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-yellow-600" />
                  </div>
                </div>
                <div className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{pendingReview}</div>
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

            {/* Client List with Filters */}
            <ClientListWithFilters
              clients={clients || []}
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
            {/* Header with Add Button */}
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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{totalExperts}</div>
                <div className="text-xs md:text-sm text-gray-600">Total Experts</div>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{activeExperts}</div>
                <div className="text-xs md:text-sm text-gray-600">Active Experts</div>
              </div>

              <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{assignedClients}</div>
                <div className="text-xs md:text-sm text-gray-600">Assigned Clients</div>
              </div>
            </div>

            {/* Expert List with Filters */}
            <ExpertListWithFilters
              experts={experts || []}
              statesByExpert={statesByExpert}
              clientsByExpert={clientsByExpert}
            />
          </div>
        )}
      </div>

      {/* Reset Password Modal */}
      {selectedUser && (
        <ResetPasswordModal
          isOpen={resetPasswordModalOpen}
          onClose={handleCloseResetPassword}
          userName={selectedUser.name}
          userEmail={selectedUser.email}
          userId={selectedUser.id}
        />
      )}

      {/* Add Expert Modal */}
      <AddExpertModal
        isOpen={isAddExpertModalOpen}
        onClose={() => setIsAddExpertModalOpen(false)}
        onSuccess={() => {
          setIsAddExpertModalOpen(false)
          router.refresh()
        }}
      />

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        onSuccess={() => {
          setIsAddUserModalOpen(false)
          router.refresh()
        }}
        agencies={agencies}
      />

      {/* Add New Client Modal (Agency Admins tab: store in clients table) */}
      <AddNewClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onSuccess={() => {
          setIsAddClientModalOpen(false)
          router.refresh()
        }}
        mode="agency_admin"
      />
    </div>
  )
}
