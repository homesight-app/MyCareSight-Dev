'use client'

import { useState, useEffect } from 'react'
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
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import AddStaffMemberModal from './AddStaffMemberModal'
import StaffActionsDropdown from './StaffActionsDropdown'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  /** Local copy so status toggles update UI immediately; resets when server props change. */
  const [localStaffList, setLocalStaffList] = useState<(StaffMember & { expiringLicensesCount?: number })[]>(
    staffWithExpiringLicenses
  )
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [statusErrorByStaffId, setStatusErrorByStaffId] = useState<Record<string, string>>({})

  useEffect(() => {
    setLocalStaffList(staffWithExpiringLicenses)
  }, [staffWithExpiringLicenses])


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

  const handleStatusToggle = async (staff: StaffMember, makeActive: boolean) => {
    const nextStatus = makeActive ? 'active' : 'inactive'
    const current = staff.status.toLowerCase()
    if (current === nextStatus) return
    setStatusUpdatingId(staff.id)
    setStatusErrorByStaffId((prev) => {
      const next = { ...prev }
      delete next[staff.id]
      return next
    })
    try {
      const supabase = createClient()
      const { error } = await q.updateStaffMember(supabase, staff.id, { status: nextStatus })
      if (error) {
        setStatusErrorByStaffId((prev) => ({
          ...prev,
          [staff.id]: error.message ?? 'Could not update status.',
        }))
        return
      }
      setLocalStaffList((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, status: nextStatus } : s))
      )
      setSelectedStaff((cur) =>
        cur?.id === staff.id ? { ...cur, status: nextStatus } : cur
      )
      router.refresh()
    } catch (e) {
      setStatusErrorByStaffId((prev) => ({
        ...prev,
        [staff.id]: e instanceof Error ? e.message : 'Could not update status.',
      }))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  // Filter staff members based on search query and filters
  const filteredStaffMembers = localStaffList.filter((staff) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch = 
        staff.first_name.toLowerCase().includes(query) ||
        staff.last_name.toLowerCase().includes(query) ||
        staff.email.toLowerCase().includes(query) ||
        staff.role.toLowerCase().includes(query) ||
        (staff.job_title && staff.job_title.toLowerCase().includes(query)) ||
        (staff.employee_id && staff.employee_id.toLowerCase().includes(query)) ||
        (staff.address && staff.address.toLowerCase().includes(query))
      
      if (!matchesSearch) return false
    }

    // Role filter
    if (selectedRole !== 'all' && staff.role !== selectedRole) {
      return false
    }

    // Status filter
    if (selectedStatus !== 'all' && staff.status !== selectedStatus) {
      return false
    }

    return true
  })

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Caregiver Management</h1>
              <p className="text-gray-600 text-sm">
                Manage your team members and track their professional licenses
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-6 py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all flex items-center gap-2 shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Add Caregiver
          </button>
        </div>

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

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search staff by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
              suppressHydrationWarning
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-4 py-3 border border-gray-300 cursor-pointer rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
            >
              <option value="all">All Roles</option>
              {
                staffRoleNames.map((roleName) => (
                  <option key={roleName} value={roleName}>{roleName}</option>
                ))
              }
            </select>
            <select 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {/* Caregivers table (layout matches design mock: caregiver + ID, role lines, status toggle, email/phone, licenses) */}
        {filteredStaffMembers.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                    >
                      Caregiver
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                    >
                      Role
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap min-w-[200px]"
                    >
                      Email
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                    >
                      Phone
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                    >
                      Certifications
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                    >
                      Expiring Certifications
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 text-right whitespace-nowrap w-[72px]"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffMembers.map((staff) => {
                    const licenses = licensesByStaff[staff.id] || []
                    const licenseCount = licenses.length
                    const expiring = staff.expiringLicensesCount ?? 0
                    const statusLower = staff.status.toLowerCase()
                    const isInactiveRow = statusLower === 'inactive'
                    const isActiveRow = statusLower === 'active'
                    const rolePrimary = staff.job_title?.trim() || staff.role
                    const roleSecondary =
                      staff.job_title?.trim() && staff.role !== rolePrimary ? staff.role : null

                    return (
                      <tr
                        key={staff.id}
                        className={`cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 transition-colors ${
                          isInactiveRow ? 'opacity-90' : ''
                        }`}
                        onClick={() => handleViewProfile(staff)}
                      >
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center gap-3 min-w-0 max-w-[280px]">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${
                                isInactiveRow ? 'bg-gray-400' : 'bg-blue-500'
                              }`}
                            >
                              {getInitials(staff.first_name, staff.last_name)}
                            </div>
                            <div className="min-w-0">
                              <div
                                className={`font-semibold text-sm truncate ${
                                  isActiveRow ? 'text-gray-900' : isInactiveRow ? 'text-gray-400' : 'text-gray-700'
                                }`}
                              >
                                {staff.first_name} {staff.last_name}
                              </div>
                              <div className="text-xs text-gray-500 truncate mt-0.5">
                                ID: {formatStaffDisplayId(staff)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle min-w-0 max-w-[240px]">
                          <div className="text-sm font-medium text-gray-900 truncate" title={rolePrimary}>
                            {rolePrimary}
                          </div>
                          {roleSecondary ? (
                            <div className="text-xs text-gray-500 truncate mt-0.5" title={roleSecondary}>
                              {roleSecondary}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 align-middle whitespace-nowrap">
                          {(() => {
                            const s = staff.status.toLowerCase()
                            const isActive = s === 'active'
                            const isPending = s === 'pending'
                            const busy = statusUpdatingId === staff.id
                            const err = statusErrorByStaffId[staff.id]
                            const statusLabel = isPending ? 'Pending' : isActive ? 'Active' : 'Inactive'
                            return (
                              <div className="flex flex-col gap-1 min-w-[7rem]">
                                <div className="flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isActive}
                                    aria-label={`${staff.first_name} ${staff.last_name}: ${statusLabel}`}
                                    disabled={busy}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleStatusToggle(staff, !isActive)
                                    }}
                                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 ${
                                      isActive ? 'bg-blue-600' : 'bg-gray-300'
                                    }`}
                                  >
                                    {busy ? (
                                      <span className="absolute inset-0 flex items-center justify-center bg-white/40 rounded-full">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-700" aria-hidden />
                                      </span>
                                    ) : null}
                                    <span
                                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                                        isActive ? 'translate-x-6' : 'translate-x-1'
                                      }`}
                                    />
                                  </button>
                                  <span
                                    className={`text-sm font-semibold ${
                                      isActive ? 'text-blue-600' : isPending ? 'text-amber-700' : 'text-gray-500'
                                    }`}
                                  >
                                    {statusLabel}
                                  </span>
                                </div>
                                {isPending ? (
                                  <span className="text-[10px] text-amber-800 leading-tight">
                                    Turn on to activate
                                  </span>
                                ) : null}
                                {err ? (
                                  <span className="text-[10px] text-red-600 max-w-[180px]" title={err}>
                                    {err}
                                  </span>
                                ) : null}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-5 py-4 align-middle min-w-0">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Mail className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.5]" />
                            <span className="truncate text-sm" title={staff.email || undefined}>
                              {staff.email || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.5]" />
                            <span className="text-sm">{staff.phone?.trim() ? staff.phone : '—'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Medal className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.5]" />
                            <span className="text-sm">
                              {licenseCount} {licenseCount === 1 ? 'Certification' : 'Certifications'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle text-sm text-gray-600">
                          {expiring > 0 ? (
                            <span className="font-medium text-amber-800 tabular-nums">{expiring}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 align-middle text-right">
                          <div className="inline-flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <StaffActionsDropdown
                              onViewProfile={() => handleViewProfile(staff)}
                              onEditInformation={() => handleEditInformation(staff)}
                              onEditSkills={() => handleEditSkills(staff)}
                              onEditHomeAddress={() => handleEditHomeAddress(staff)}
                              onManageDocuments={() => handleManageDocuments(staff)}
                              onManageLicenses={() => handleManageLicenses(staff)}
                            />
                          </div>
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
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all"
            >
              Clear Filters
            </button>
          </div>
        ) : null}
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

