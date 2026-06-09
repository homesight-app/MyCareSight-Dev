'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Pencil, Loader2, X, Plus, ChevronDown, Trash2 } from 'lucide-react'
import { saveKeyStaffAdmin, removeKeyStaff, addMemberOwner } from '@/app/actions/agency-onboarding'
import type { AgencyKeyStaff } from '@/lib/supabase/query'

const OFFICER_ROLES = [
  { key: 'president', label: 'President' },
  { key: 'vice_president', label: 'Vice President' },
  { key: 'secretary', label: 'Secretary' },
  { key: 'treasurer_cfo', label: 'Treasurer / CFO' },
  { key: 'administrator', label: 'Administrator' },
  { key: 'alternate_administrator', label: 'Alternate Administrator' },
  { key: 'rn_supervisor', label: 'RN Supervisor' },
] as const

type OfficerRoleKey = typeof OFFICER_ROLES[number]['key']

const EMPLOYMENT_TYPE_ROLES: OfficerRoleKey[] = ['administrator', 'alternate_administrator', 'rn_supervisor']

const LICENSE_TYPE_OPTIONS = [
  { value: 'physician', label: 'Physician' },
  { value: 'rn', label: 'Registered Nurse (RN)' },
  { value: 'nursing_home_admin', label: 'Nursing Home Administrator' },
  { value: 'other', label: 'Other' },
]

interface AgencyKeyStaffSectionProps {
  agencyId: string
  keyStaff: AgencyKeyStaff[]
}

type StaffEditForm = {
  full_legal_name: string
  telephone: string
  email: string
  date_of_birth: string
  ssn: string
  home_address_street: string
  home_address_city: string
  home_address_state: string
  home_address_zip: string
  date_of_hire: string
  is_licensed: boolean
  license_type: string
  professional_license_number: string
  employment_type: string
}

type MemberOwnerAddForm = {
  full_legal_name: string
  telephone: string
  email: string
  ownership_percentage: string
  date_of_birth: string
  ssn: string
  home_address_street: string
  home_address_city: string
  home_address_state: string
  home_address_zip: string
}

type MemberOwnerEditForm = MemberOwnerAddForm

function emptyOfficerForm(): StaffEditForm {
  return {
    full_legal_name: '',
    telephone: '',
    email: '',
    date_of_birth: '',
    ssn: '',
    home_address_street: '',
    home_address_city: '',
    home_address_state: '',
    home_address_zip: '',
    date_of_hire: '',
    is_licensed: false,
    license_type: '',
    professional_license_number: '',
    employment_type: '',
  }
}

function staffToOfficerForm(s: AgencyKeyStaff): StaffEditForm {
  return {
    full_legal_name: s.full_legal_name ?? '',
    telephone: s.telephone ?? '',
    email: s.email ?? '',
    date_of_birth: s.date_of_birth ?? '',
    ssn: '',
    home_address_street: s.home_address_street ?? '',
    home_address_city: s.home_address_city ?? '',
    home_address_state: s.home_address_state ?? '',
    home_address_zip: s.home_address_zip ?? '',
    date_of_hire: s.date_of_hire ?? '',
    is_licensed: s.is_licensed ?? false,
    license_type: s.license_type ?? '',
    professional_license_number: s.professional_license_number ?? '',
    employment_type: s.employment_type ?? '',
  }
}

function emptyMemberOwnerForm(): MemberOwnerAddForm {
  return {
    full_legal_name: '',
    telephone: '',
    email: '',
    ownership_percentage: '',
    date_of_birth: '',
    ssn: '',
    home_address_street: '',
    home_address_city: '',
    home_address_state: '',
    home_address_zip: '',
  }
}

function staffToMemberOwnerForm(s: AgencyKeyStaff): MemberOwnerEditForm {
  return {
    full_legal_name: s.full_legal_name ?? '',
    telephone: s.telephone ?? '',
    email: s.email ?? '',
    ownership_percentage: s.ownership_percentage ?? '',
    date_of_birth: s.date_of_birth ?? '',
    ssn: '',
    home_address_street: s.home_address_street ?? '',
    home_address_city: s.home_address_city ?? '',
    home_address_state: s.home_address_state ?? '',
    home_address_zip: s.home_address_zip ?? '',
  }
}

function FieldRow({ label, value, isEditing, onChange, type = 'text', className, placeholder }: {
  label: string
  value: string
  isEditing: boolean
  onChange: (v: string) => void
  type?: string
  className?: string
  placeholder?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {isEditing ? (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="block w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
        />
      ) : (
        <p className="text-sm text-gray-900">{value || '—'}</p>
      )}
    </div>
  )
}

function SelectRow({ label, value, isEditing, onChange, options, className }: {
  label: string
  value: string
  isEditing: boolean
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  const found = options.find(o => o.value === value)
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {isEditing ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="block w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white"
        >
          <option value="">Select…</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-gray-900">{found?.label || '—'}</p>
      )}
    </div>
  )
}

export default function AgencyKeyStaffSection({ agencyId, keyStaff }: AgencyKeyStaffSectionProps) {
  const router = useRouter()

  // Officer roles state
  const [editingRole, setEditingRole] = useState<OfficerRoleKey | null>(null)
  const [editForm, setEditForm] = useState<StaffEditForm>(emptyOfficerForm())
  const [isSavingOfficer, setIsSavingOfficer] = useState(false)
  const [officerSaveError, setOfficerSaveError] = useState<string | null>(null)
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())

  // Member/owner state
  const [showAddOwner, setShowAddOwner] = useState(false)
  const [addOwnerForm, setAddOwnerForm] = useState<MemberOwnerAddForm>(emptyMemberOwnerForm())
  const [isAddingOwner, setIsAddingOwner] = useState(false)
  const [addOwnerError, setAddOwnerError] = useState<string | null>(null)
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null)
  const [ownerEditForm, setOwnerEditForm] = useState<MemberOwnerEditForm>(emptyMemberOwnerForm())
  const [isSavingOwner, setIsSavingOwner] = useState(false)
  const [ownerSaveError, setOwnerSaveError] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)

  const officerStaff = keyStaff.filter(s => s.officer_role !== 'member_owner')
  const memberOwners = keyStaff.filter(s => s.officer_role === 'member_owner')
  const staffByRole = new Map(officerStaff.map(s => [s.officer_role, s]))

  const filledOfficers = officerStaff.filter(s => s.full_legal_name)

  const toggleExpand = (roleKey: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev)
      next.has(roleKey) ? next.delete(roleKey) : next.add(roleKey)
      return next
    })
  }

  const startEditOfficer = (roleKey: OfficerRoleKey) => {
    const existing = staffByRole.get(roleKey)
    setEditForm(existing ? staffToOfficerForm(existing) : emptyOfficerForm())
    setEditingRole(roleKey)
    setOfficerSaveError(null)
    setExpandedRoles(prev => new Set([...prev, roleKey]))
  }

  const cancelEditOfficer = () => {
    setEditingRole(null)
    setOfficerSaveError(null)
  }

  const handleSaveOfficer = async () => {
    if (!editingRole) return
    setIsSavingOfficer(true)
    setOfficerSaveError(null)
    const result = await saveKeyStaffAdmin(agencyId, editingRole, {
      ...editForm,
      ssn: editForm.ssn || undefined,
      license_type: editForm.is_licensed ? editForm.license_type : '',
    })
    setIsSavingOfficer(false)
    if (result.error) { setOfficerSaveError(result.error); return }
    setEditingRole(null)
    router.refresh()
  }

  const handleRemove = async (staffId: string) => {
    if (!confirm('Remove this key staff record?')) return
    setIsRemoving(staffId)
    await removeKeyStaff(agencyId, staffId)
    setIsRemoving(null)
    router.refresh()
  }

  const handleAddOwner = async () => {
    setIsAddingOwner(true)
    setAddOwnerError(null)
    const result = await addMemberOwner(agencyId, {
      ...addOwnerForm,
      ssn: addOwnerForm.ssn || undefined,
    })
    setIsAddingOwner(false)
    if (result.error) { setAddOwnerError(result.error); return }
    setShowAddOwner(false)
    setAddOwnerForm(emptyMemberOwnerForm())
    router.refresh()
  }

  const startEditOwner = (owner: AgencyKeyStaff) => {
    setOwnerEditForm(staffToMemberOwnerForm(owner))
    setEditingOwnerId(owner.id)
    setOwnerSaveError(null)
  }

  const handleSaveOwner = async () => {
    if (!editingOwnerId) return
    setIsSavingOwner(true)
    setOwnerSaveError(null)
    const result = await saveKeyStaffAdmin(agencyId, 'member_owner', {
      ...ownerEditForm,
      ssn: ownerEditForm.ssn || undefined,
    })
    setIsSavingOwner(false)
    if (result.error) { setOwnerSaveError(result.error); return }
    setEditingOwnerId(null)
    router.refresh()
  }

  const copyFromOfficerToAdd = (sourceRole: string) => {
    const source = staffByRole.get(sourceRole)
    if (!source) return
    setAddOwnerForm(prev => ({
      ...prev,
      full_legal_name: source.full_legal_name ?? prev.full_legal_name,
      telephone: source.telephone ?? prev.telephone,
      email: source.email ?? prev.email,
    }))
  }

  const copyFromOfficerToEdit = (sourceRole: string) => {
    const source = staffByRole.get(sourceRole)
    if (!source) return
    setOwnerEditForm(prev => ({
      ...prev,
      full_legal_name: source.full_legal_name ?? prev.full_legal_name,
      telephone: source.telephone ?? prev.telephone,
      email: source.email ?? prev.email,
    }))
  }

  const setOfficerField = <K extends keyof StaffEditForm>(key: K, val: StaffEditForm[K]) =>
    setEditForm(prev => ({ ...prev, [key]: val }))

  const setAddOwnerField = <K extends keyof MemberOwnerAddForm>(key: K, val: MemberOwnerAddForm[K]) =>
    setAddOwnerForm(prev => ({ ...prev, [key]: val }))

  const setOwnerEditField = <K extends keyof MemberOwnerEditForm>(key: K, val: MemberOwnerEditForm[K]) =>
    setOwnerEditForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
        <Users className="w-5 h-5 text-purple-600" />
        <h2 className="text-base font-semibold text-gray-900">Key Staff</h2>
      </div>

      {/* Officer roles */}
      <div className="divide-y divide-gray-100">
        {OFFICER_ROLES.map(({ key: roleKey, label }) => {
          const existing = staffByRole.get(roleKey)
          const isExpanded = expandedRoles.has(roleKey)
          const isEditing = editingRole === roleKey
          const showEmploymentType = EMPLOYMENT_TYPE_ROLES.includes(roleKey)

          return (
            <div key={roleKey} className="px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleExpand(roleKey)}
                    className="flex items-center gap-2 text-left min-w-0"
                  >
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    <span className="text-sm font-semibold text-gray-800">{label}</span>
                  </button>
                  {existing && (
                    <span className="text-sm text-gray-600 truncate hidden sm:block">
                      {existing.full_legal_name ?? existing.email ?? ''}
                    </span>
                  )}
                  {!existing && (
                    <span className="text-xs text-gray-400 italic">Not filled</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => startEditOfficer(roleKey)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {existing ? <Pencil className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {existing ? 'Edit' : 'Add'}
                    </button>
                  )}
                  {existing && !isEditing && (
                    <button
                      type="button"
                      onClick={() => handleRemove(existing.id)}
                      disabled={isRemoving === existing.id}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      {isRemoving === existing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {(isExpanded || isEditing) && (
                <div className="mt-4 space-y-4">
                  {officerSaveError && isEditing && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{officerSaveError}</div>
                  )}

                  {/* Contact */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contact</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <FieldRow label="Full Legal Name" value={isEditing ? editForm.full_legal_name : existing?.full_legal_name ?? ''} isEditing={isEditing} onChange={v => setOfficerField('full_legal_name', v)} />
                      <FieldRow label="Phone" value={isEditing ? editForm.telephone : existing?.telephone ?? ''} isEditing={isEditing} onChange={v => setOfficerField('telephone', v)} />
                      <FieldRow label="Email" value={isEditing ? editForm.email : existing?.email ?? ''} isEditing={isEditing} onChange={v => setOfficerField('email', v)} type="email" />
                    </div>
                  </div>

                  {/* Administrative */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Administrative</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldRow label="Date of Birth" value={isEditing ? editForm.date_of_birth : existing?.date_of_birth ?? ''} isEditing={isEditing} onChange={v => setOfficerField('date_of_birth', v)} type="date" />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">SSN</label>
                        {isEditing ? (
                          <input
                            type="password"
                            value={editForm.ssn}
                            onChange={e => setOfficerField('ssn', e.target.value)}
                            placeholder="Enter to update (leave blank to keep existing)"
                            autoComplete="new-password"
                            className="block w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 font-mono">
                            {existing?.ssn_last4 ? `•••-••-${existing.ssn_last4}` : '—'}
                          </p>
                        )}
                      </div>
                      <FieldRow label="Date of Hire" value={isEditing ? editForm.date_of_hire : existing?.date_of_hire ?? ''} isEditing={isEditing} onChange={v => setOfficerField('date_of_hire', v)} type="date" />
                      {showEmploymentType && (
                        <SelectRow
                          label="Employment Type"
                          value={isEditing ? editForm.employment_type : existing?.employment_type ?? ''}
                          isEditing={isEditing}
                          onChange={v => setOfficerField('employment_type', v)}
                          options={[{ value: 'full_time', label: 'Full Time' }, { value: 'part_time', label: 'Part Time' }]}
                        />
                      )}
                    </div>
                  </div>

                  {/* Home Address */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Home Address</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldRow label="Street" value={isEditing ? editForm.home_address_street : existing?.home_address_street ?? ''} isEditing={isEditing} onChange={v => setOfficerField('home_address_street', v)} className="sm:col-span-2" />
                      <FieldRow label="City" value={isEditing ? editForm.home_address_city : existing?.home_address_city ?? ''} isEditing={isEditing} onChange={v => setOfficerField('home_address_city', v)} />
                      <FieldRow label="State" value={isEditing ? editForm.home_address_state : existing?.home_address_state ?? ''} isEditing={isEditing} onChange={v => setOfficerField('home_address_state', v)} />
                      <FieldRow label="ZIP" value={isEditing ? editForm.home_address_zip : existing?.home_address_zip ?? ''} isEditing={isEditing} onChange={v => setOfficerField('home_address_zip', v)} />
                    </div>
                  </div>

                  {/* Licensing */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Licensing</h4>
                    {isEditing ? (
                      <div className="space-y-3">
                        <FieldRow label="Professional License #" value={editForm.professional_license_number} isEditing onChange={v => setOfficerField('professional_license_number', v)} />
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={editForm.is_licensed}
                            onChange={e => setOfficerField('is_licensed', e.target.checked)}
                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          />
                          Licensed (physician, RN, or nursing home administrator)
                        </label>
                        {editForm.is_licensed && (
                          <SelectRow
                            label="License Type"
                            value={editForm.license_type}
                            isEditing
                            onChange={v => setOfficerField('license_type', v)}
                            options={LICENSE_TYPE_OPTIONS}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {existing?.professional_license_number && (
                          <p className="text-sm text-gray-900">License #: {existing.professional_license_number}</p>
                        )}
                        <p className="text-sm text-gray-900">
                          {existing?.is_licensed
                            ? LICENSE_TYPE_OPTIONS.find(o => o.value === existing.license_type)?.label ?? 'Licensed'
                            : '—'}
                        </p>
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                      <button type="button" onClick={cancelEditOfficer} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveOfficer}
                        disabled={isSavingOfficer}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                      >
                        {isSavingOfficer && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Members / Owners */}
      <div className="border-t border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Members / Owners</h3>
          <button
            type="button"
            onClick={() => { setShowAddOwner(true); setAddOwnerForm(emptyMemberOwnerForm()); setAddOwnerError(null) }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700 border border-purple-300 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Member/Owner
          </button>
        </div>

        {memberOwners.length === 0 && !showAddOwner && (
          <div className="px-6 py-4 text-sm text-gray-400 italic">No members/owners on file.</div>
        )}

        <div className="divide-y divide-gray-100">
          {memberOwners.map(owner => {
            const isEditingThis = editingOwnerId === owner.id
            return (
              <div key={owner.id} className="px-6 py-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {owner.full_legal_name ?? <span className="italic text-gray-400">Unnamed</span>}
                    </p>
                    {owner.ownership_percentage && (
                      <p className="text-xs text-gray-500">{owner.ownership_percentage}% ownership</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isEditingThis && (
                      <button
                        type="button"
                        onClick={() => startEditOwner(owner)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    )}
                    {!isEditingThis && (
                      <button
                        type="button"
                        onClick={() => handleRemove(owner.id)}
                        disabled={isRemoving === owner.id}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove"
                      >
                        {isRemoving === owner.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {isEditingThis && (
                  <div className="space-y-4">
                    {ownerSaveError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{ownerSaveError}</div>
                    )}
                    {filledOfficers.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Copy from Officer</label>
                        <select
                          value=""
                          onChange={e => { if (e.target.value) copyFromOfficerToEdit(e.target.value) }}
                          className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none text-gray-600"
                        >
                          <option value="">Select officer to copy…</option>
                          {filledOfficers.map(s => (
                            <option key={s.id} value={s.officer_role}>{s.officer_role.replace(/_/g, ' ')}: {s.full_legal_name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldRow label="Full Legal Name" value={ownerEditForm.full_legal_name} isEditing onChange={v => setOwnerEditField('full_legal_name', v)} />
                      <FieldRow label="Phone" value={ownerEditForm.telephone} isEditing onChange={v => setOwnerEditField('telephone', v)} />
                      <FieldRow label="Email" value={ownerEditForm.email} isEditing onChange={v => setOwnerEditField('email', v)} type="email" />
                      <FieldRow label="Ownership %" value={ownerEditForm.ownership_percentage} isEditing onChange={v => setOwnerEditField('ownership_percentage', v)} placeholder="e.g. 25" />
                      <FieldRow label="Date of Birth" value={ownerEditForm.date_of_birth} isEditing onChange={v => setOwnerEditField('date_of_birth', v)} type="date" />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">SSN</label>
                        <input
                          type="password"
                          value={ownerEditForm.ssn}
                          onChange={e => setOwnerEditField('ssn', e.target.value)}
                          placeholder="Enter to update"
                          autoComplete="new-password"
                          className="block w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                        />
                      </div>
                      <FieldRow label="Home Street" value={ownerEditForm.home_address_street} isEditing onChange={v => setOwnerEditField('home_address_street', v)} className="sm:col-span-2" />
                      <FieldRow label="City" value={ownerEditForm.home_address_city} isEditing onChange={v => setOwnerEditField('home_address_city', v)} />
                      <FieldRow label="State" value={ownerEditForm.home_address_state} isEditing onChange={v => setOwnerEditField('home_address_state', v)} />
                      <FieldRow label="ZIP" value={ownerEditForm.home_address_zip} isEditing onChange={v => setOwnerEditField('home_address_zip', v)} />
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                      <button type="button" onClick={() => setEditingOwnerId(null)} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveOwner}
                        disabled={isSavingOwner}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                      >
                        {isSavingOwner && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {!isEditingThis && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm text-gray-600">
                    {owner.telephone && <span>{owner.telephone}</span>}
                    {owner.email && <span className="truncate">{owner.email}</span>}
                    {owner.ssn_last4 && <span className="font-mono text-gray-500">SSN: •••-••-{owner.ssn_last4}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add member/owner form */}
        {showAddOwner && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">New Member / Owner</h4>
            {addOwnerError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">{addOwnerError}</div>
            )}
            {filledOfficers.length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Copy from Officer</label>
                <select
                  value=""
                  onChange={e => { if (e.target.value) copyFromOfficerToAdd(e.target.value) }}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none text-gray-600"
                >
                  <option value="">Select officer to copy…</option>
                  {filledOfficers.map(s => (
                    <option key={s.id} value={s.officer_role}>{s.officer_role.replace(/_/g, ' ')}: {s.full_legal_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldRow label="Full Legal Name" value={addOwnerForm.full_legal_name} isEditing onChange={v => setAddOwnerField('full_legal_name', v)} />
              <FieldRow label="Phone" value={addOwnerForm.telephone} isEditing onChange={v => setAddOwnerField('telephone', v)} />
              <FieldRow label="Email" value={addOwnerForm.email} isEditing onChange={v => setAddOwnerField('email', v)} type="email" />
              <FieldRow label="Ownership %" value={addOwnerForm.ownership_percentage} isEditing onChange={v => setAddOwnerField('ownership_percentage', v)} />
              <FieldRow label="Date of Birth" value={addOwnerForm.date_of_birth} isEditing onChange={v => setAddOwnerField('date_of_birth', v)} type="date" />
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">SSN</label>
                <input
                  type="password"
                  value={addOwnerForm.ssn}
                  onChange={e => setAddOwnerField('ssn', e.target.value)}
                  placeholder="Optional"
                  autoComplete="new-password"
                  className="block w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
              <FieldRow label="Home Street" value={addOwnerForm.home_address_street} isEditing onChange={v => setAddOwnerField('home_address_street', v)} className="sm:col-span-2" />
              <FieldRow label="City" value={addOwnerForm.home_address_city} isEditing onChange={v => setAddOwnerField('home_address_city', v)} />
              <FieldRow label="State" value={addOwnerForm.home_address_state} isEditing onChange={v => setAddOwnerField('home_address_state', v)} />
              <FieldRow label="ZIP" value={addOwnerForm.home_address_zip} isEditing onChange={v => setAddOwnerField('home_address_zip', v)} />
            </div>
            <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-gray-200">
              <button type="button" onClick={() => setShowAddOwner(false)} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddOwner}
                disabled={isAddingOwner}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {isAddingOwner && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
