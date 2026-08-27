'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Mail,
  Phone,
  Medal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import AddStaffMemberModal from './AddStaffMemberModal'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import TablePagination from '@/components/ui/TablePagination'
import ViewStaffDetailsModal from './ViewStaffDetailsModal'
import EditCaregiverSkillsModal from './EditCaregiverSkillsModal'
import EditCaregiverHomeAddressModal from './EditCaregiverHomeAddressModal'
import EditStaffModal from './EditStaffModal'
import ManageLicensesModal from './ManageLicensesModal'
import ManageCaregiverDocumentsModal from './ManageCaregiverDocumentsModal'
import type { PatientDocument } from '@/lib/supabase/query/patients'

interface StaffMember {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  role: string
  job_title?: string | null
  status: string
  employee_id?: string | null
  start_date?: string | null
  agency_id?: string | null
  /** Current hourly pay from `caregiver_pay_rates` (open-ended row), when set. */
  currentPayRate?: number | null
  address?: string | null
  state?: string | null
  zip_code?: string | null
  skills?: string[] | null
  created_at?: string
  expiringLicensesCount?: number
  documents?: PatientDocument[] | null
  pay_rate?: string | number | null
}

interface StaffLicense {
  id: string
  caregiver_member_id: string
  license_type: string
  license_number: string
  state?: string | null
  status: string
  expiry_date?: string | null
  days_until_expiry?: number | null
}

interface StaffManagementClientProps {
  staffMembers: StaffMember[]
  licensesByStaff: Record<string, StaffLicense[]>
  totalStaff: number
  activeStaff: number
  expiringLicenses: number
  staffWithExpiringLicenses: (StaffMember & { expiringLicensesCount?: number })[]
  staffRoleNames: string[]
  canManageNotes?: boolean
  agencyId?: string
  totalCount: number
  page: number
  pageSize: number
  initialSearch?: string
  initialRole?: string
  initialStatus?: string
}

export default function StaffManagementClient({
  staffMembers,
  licensesByStaff,
  totalStaff,
  activeStaff,
  expiringLicenses,
  staffWithExpiringLicenses,
  staffRoleNames,
  canManageNotes,
  agencyId,
  totalCount,
  page,
  pageSize,
  initialSearch = '',
  initialRole = 'all',
  initialStatus = 'all',
}: StaffManagementClientProps) {
  const router = useRouter()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [isViewProfileOpen, setIsViewProfileOpen] = useState(false)
  const [isEditSkillsOpen, setIsEditSkillsOpen] = useState(false)
  const [isEditHomeAddressOpen, setIsEditHomeAddressOpen] = useState(false)
  const [isEditInformationOpen, setIsEditInformationOpen] = useState(false)
  const [isManageLicensesOpen, setIsManageLicensesOpen] = useState(false)
  const [isManageDocumentsOpen, setIsManageDocumentsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [selectedRole, setSelectedRole] = useState(initialRole)
  const [selectedStatus, setSelectedStatus] = useState(initialStatus)
  const [staffTab, setStaffTab] = useState<'active' | 'inactive'>(
    initialStatus === 'inactive' ? 'inactive' : 'active'
  )
  /** Local copy so status toggles update UI immediately; resets when server props change. */
  const [localStaffList, setLocalStaffList] = useState<(StaffMember & { expiringLicensesCount?: number })[]>(
    staffWithExpiringLicenses
  )
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    setLocalStaffList(staffWithExpiringLicenses)
  }, [staffWithExpiringLicenses])

  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize))
  const displayFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const displayTo   = Math.min((page + 1) * pageSize, totalCount)

  const pushParams = useCallback(
    (overrides: { page?: number; q?: string; role?: string; status?: string }) => {
      const p = new URLSearchParams()
      const newPage   = overrides.page ?? 0
      const newSearch = overrides.q      !== undefined ? overrides.q      : searchQuery
      const newRole   = overrides.role   !== undefined ? overrides.role   : selectedRole
      const newStatus = overrides.status !== undefined ? overrides.status : selectedStatus
      if (newPage > 0)          p.set('page',   String(newPage))
      if (newSearch.trim())     p.set('q',      newSearch.trim())
      if (newRole !== 'all')    p.set('role',   newRole)
      if (newStatus !== 'all')  p.set('status', newStatus)
      router.push(`?${p.toString()}`, { scroll: false })
    },
    [router, searchQuery, selectedRole, selectedStatus]
  )

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchQuery !== initialSearch) {
        pushParams({ q: searchQuery, page: 0 })
      }
    }, 400)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  }

  /** Shown under caregiver name (mock: "ID: gsfda-453"). Prefer employee_id; else compact uuid. */
  const formatStaffDisplayId = (staff: StaffMember) => {
    const eid = staff.employee_id?.trim()
    if (eid) return eid
    const compact = staff.id.replace(/-/g, '')
    if (compact.length >= 8) return `${compact.slice(0, 5)}-${compact.slice(5, 8)}`
    return staff.id.slice(0, 8)
  }

  const handleStaffTabChange = (newTab: 'active' | 'inactive') => {
    if (newTab === staffTab) return
    setStaffTab(newTab)
    setSelectedStatus(newTab)
    pushParams({ status: newTab, page: 0 })
  }

  const inactiveCount = totalStaff - activeStaff

  const handleStatusToggle = async (staff: StaffMember, makeActive: boolean) => {
    const nextStatus = makeActive ? 'active' : 'inactive'
    const current = staff.status.toLowerCase()
    if (current === nextStatus) return
    setStatusUpdatingId(staff.id)
    try {
      const supabase = createClient()
      const { error } = await q.updateStaffMember(supabase, staff.id, { status: nextStatus })
      if (error) {
        alert(`Could not update status: ${error.message}`)
        return
      }
      setLocalStaffList((prev) => prev.filter((s) => s.id !== staff.id))
      setSelectedStaff((cur) =>
        cur?.id === staff.id ? { ...cur, status: nextStatus } : cur
      )
      router.refresh()
    } catch (e) {
      alert(`Could not update status: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setStatusUpdatingId(null)
    }
  }

  // Filter staff members based on search query and filters
  // Server-side filtered; localStaffList is the current page from the server.
  const filteredStaffMembers = localStaffList

  const handleViewProfile = (staff: StaffMember) => {
    setSelectedStaff(staff)
    setIsViewProfileOpen(true)
  }

  const handleEditInformation = (staff: StaffMember) => {
    setSelectedStaff(staff)
    setIsEditInformationOpen(true)
  }

  const handleEditSkills = (staff: StaffMember) => {
    setSelectedStaff(staff)
    setIsEditSkillsOpen(true)
  }

  const handleEditHomeAddress = (staff: StaffMember) => {
    setSelectedStaff(staff)
    setIsEditHomeAddressOpen(true)
  }

  const handleManageLicenses = (staff: StaffMember) => {
    setSelectedStaff(staff)
    setIsManageLicensesOpen(true)
  }

  const handleManageDocuments = (staff: StaffMember) => {
    setSelectedStaff(staff)
    setIsManageDocumentsOpen(true)
  }

  return (
    <>
      <div className="space-y-6 ">
        {/* Header */}


        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-semibold text-gray-600">Total Caregivers</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{totalStaff}</div>
          </div>


          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <span className="text-sm font-semibold text-gray-600">Active Caregivers</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{activeStaff}</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-yellow-600" />
              <span className="text-sm font-semibold text-gray-600">Licenses Expiring Soon</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{expiringLicenses}</div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">

          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-6 py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all flex items-center gap-2 shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Add Caregiver
          </button>
        </div>
        {/* Active/Inactive tabs + Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => handleStaffTabChange('active')}
              aria-pressed={staffTab === 'active'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${staffTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => handleStaffTabChange('inactive')}
              aria-pressed={staffTab === 'inactive'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${staffTab === 'inactive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
            </button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name, email, or role…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
              suppressHydrationWarning
            />
          </div>
          <select
            value={selectedRole}
            onChange={(e) => { setSelectedRole(e.target.value); pushParams({ role: e.target.value, page: 0 }) }}
            className="px-4 py-2.5 border border-gray-200 cursor-pointer rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm"
          >
            <option value="all">All Roles</option>
            {staffRoleNames.map((roleName) => (
              <option key={roleName} value={roleName}>{roleName}</option>
            ))}
          </select>
        </div>

        {/* Caregivers table (layout matches design mock: caregiver + ID, role lines, status toggle, email/phone, licenses) */}
        {filteredStaffMembers.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="w-10 px-2 py-2.5" />
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Caregiver</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Role</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap min-w-[200px]">Email</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Phone</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Certifications</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Expiring</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffMembers.map((staff) => {
                    const licenses = licensesByStaff[staff.id] || []
                    const licenseCount = licenses.length
                    const expiring = staff.expiringLicensesCount ?? 0
                    const statusLower = staff.status.toLowerCase()
                    const isActive = statusLower === 'active'
                    const isPending = statusLower === 'pending'
                    const isInactive = statusLower === 'inactive'
                    const rolePrimary = staff.job_title?.trim() || staff.role
                    const roleSecondary =
                      staff.job_title?.trim() && staff.role !== rolePrimary ? staff.role : null

                    return (
                      <tr
                        key={staff.id}
                        className="cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors"
                        onClick={() => handleViewProfile(staff)}
                      >
                        <td className="w-10 px-2 py-3 align-middle" onClick={e => e.stopPropagation()}>
                          <RecordActionsMenu
                            label={`Actions for ${staff.first_name} ${staff.last_name}`}
                            actions={[
                              { label: 'View Profile', onClick: () => handleViewProfile(staff) },
                              { label: 'Edit Information', onClick: () => handleEditInformation(staff) },
                              { label: 'Edit Skills', onClick: () => handleEditSkills(staff) },
                              { label: 'Edit Home Address', onClick: () => handleEditHomeAddress(staff) },
                              { label: 'Manage Documents', onClick: () => handleManageDocuments(staff) },
                              { label: 'Manage Certifications', onClick: () => handleManageLicenses(staff) },
                              {
                                label: isActive ? 'Deactivate' : 'Activate',
                                onClick: () => handleStatusToggle(staff, !isActive),
                                destructive: isActive,
                                positive: !isActive,
                                hidden: statusUpdatingId === staff.id,
                              },
                            ]}
                          />
                        </td>
                        <td className={`px-4 py-3 align-middle ${isInactive ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-3 min-w-0 max-w-[280px]">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${isInactive ? 'bg-gray-400' : 'bg-blue-500'}`}>
                              {getInitials(staff.first_name, staff.last_name)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-gray-900 truncate">
                                {staff.first_name} {staff.last_name}
                              </div>
                              <div className="text-xs text-gray-400 truncate mt-0.5">
                                ID: {formatStaffDisplayId(staff)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-3 align-middle min-w-0 max-w-[200px] ${isInactive ? 'opacity-60' : ''}`}>
                          <div className="text-sm font-medium text-gray-900 truncate">{rolePrimary}</div>
                          {roleSecondary && <div className="text-xs text-gray-500 truncate mt-0.5">{roleSecondary}</div>}
                        </td>
                        <td className={`px-4 py-3 align-middle min-w-0 ${isInactive ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Mail className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.5]" />
                            <span className="truncate text-sm">{staff.email || '—'}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 align-middle whitespace-nowrap ${isInactive ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.5]" />
                            <span className="text-sm">{staff.phone?.trim() || '—'}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 align-middle ${isInactive ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Medal className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.5]" />
                            <span className="text-sm">{licenseCount}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 align-middle text-sm ${isInactive ? 'opacity-60' : ''}`}>
                          {expiring > 0
                            ? <span className="font-medium text-amber-700">{expiring}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            isActive ? 'bg-green-100 text-green-700'
                            : isPending ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-500'
                          }`}>
                            {isActive ? 'Active' : isPending ? 'Pending' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Empty State */}
        {staffMembers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No caregivers yet</h3>
            <p className="text-gray-600 mb-6">Get started by adding your first caregiver</p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all"
            >
              <Plus className="w-5 h-5" />
              Add Caregiver
            </button>
          </div>
        ) : filteredStaffMembers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center">
            <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No caregivers found</h3>
            <p className="text-gray-600 mb-6">Try adjusting your search or filter criteria</p>
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedRole('all')
                setSelectedStatus('all')
                pushParams({ q: '', role: 'all', status: 'all', page: 0 })
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all"
            >
              Clear Filters
            </button>
          </div>
        ) : null}

        {totalCount > 0 && (
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={(n) => pushParams({ page: n })}
            entityLabel="caregivers"
          />
        )}
      </div>

      {/* Modals */}
      <AddStaffMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          setIsAddModalOpen(false)
        }}
        staffRoleNames={staffRoleNames}
      />

      {selectedStaff && (
        <>
          <ViewStaffDetailsModal
            isOpen={isViewProfileOpen}
            onClose={() => {
              setIsViewProfileOpen(false)
              setSelectedStaff(null)
            }}
            staff={
              (localStaffList.find((s) => s.id === selectedStaff.id) as StaffMember) ?? selectedStaff
            }
            licenses={licensesByStaff[selectedStaff.id] || []}
            canManageNotes={canManageNotes}
            agencyId={agencyId}
          />

          <EditStaffModal
            isOpen={isEditInformationOpen}
            onClose={() => setIsEditInformationOpen(false)}
            staff={
              (localStaffList.find((s) => s.id === selectedStaff.id) as StaffMember) ?? selectedStaff
            }
            staffRoleNames={staffRoleNames}
            onSuccess={() => {
              setIsEditInformationOpen(false)
              setSelectedStaff(null)
              router.refresh()
            }}
          />

          <EditCaregiverSkillsModal
            isOpen={isEditSkillsOpen}
            onClose={() => {
              setIsEditSkillsOpen(false)
            }}
            caregiver={selectedStaff}
            onSuccess={() => {
              setIsEditSkillsOpen(false)
              setSelectedStaff(null)
              router.refresh()
            }}
          />

          <EditCaregiverHomeAddressModal
            isOpen={isEditHomeAddressOpen}
            onClose={() => {
              setIsEditHomeAddressOpen(false)
            }}
            caregiver={selectedStaff}
            onSuccess={() => {
              setIsEditHomeAddressOpen(false)
              setSelectedStaff(null)
              router.refresh()
            }}
          />

          <ManageCaregiverDocumentsModal
            isOpen={isManageDocumentsOpen}
            onClose={() => {
              setIsManageDocumentsOpen(false)
              setSelectedStaff(null)
            }}
            staffId={selectedStaff.id}
            staffName={`${selectedStaff.first_name} ${selectedStaff.last_name}`.trim()}
            initialDocuments={
              (localStaffList.find((s) => s.id === selectedStaff.id) as StaffMember | undefined)
                ?.documents ?? selectedStaff.documents
            }
          />

          <ManageLicensesModal
            isOpen={isManageLicensesOpen}
            onClose={() => {
              setIsManageLicensesOpen(false)
              setSelectedStaff(null)
            }}
            staffId={selectedStaff.id}
            staffName={`${selectedStaff.first_name} ${selectedStaff.last_name}`.trim()}
            existingLicenses={(licensesByStaff[selectedStaff.id] || []).map((l) => ({
              id: l.id,
              license_type: l.license_type,
              license_number: l.license_number,
              state: l.state,
              status: l.status,
              expiry_date: l.expiry_date,
              days_until_expiry: l.days_until_expiry,
            }))}
            onSuccess={() => {
              router.refresh()
            }}
          />
        </>
      )}
    </>
  )
}

