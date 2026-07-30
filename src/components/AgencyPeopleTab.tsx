'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, UserPlus, Loader2, Mail, Phone, RefreshCw, ChevronDown,
  Shield, User, UserX, UserCheck, Settings, KeyRound, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from './Modal'
import ResetPasswordModal from './ResetPasswordModal'
import {
  updateAgencyAdminStatus,
  updateCareCoordinatorStatus,
  updateAgencyAdminProfile,
  updateCareCoordinatorProfile,
  createAndLinkAgencyAdmin,
  addCareCoordinatorForAgency,
  promoteKeyStaffToUser,
} from '@/app/actions/agency-users'
import { saveKeyStaffAdmin, removeKeyStaff, addMemberOwner, updateMemberOwner } from '@/app/actions/agency-onboarding'
import type { AgencyKeyStaff } from '@/lib/supabase/query'

// ——— Types ————————————————————————————————————————————————

interface AdminRecord {
  id: string
  user_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  status: string | null
}

interface CoordinatorRecord {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  email: string
  status: string
}

const OFFICER_ROLES = [
  { key: 'president',               label: 'President' },
  { key: 'vice_president',          label: 'Vice President' },
  { key: 'secretary',               label: 'Secretary' },
  { key: 'treasurer_cfo',           label: 'Treasurer / CFO' },
  { key: 'administrator',           label: 'Administrator' },
  { key: 'alternate_administrator', label: 'Alternate Administrator' },
  { key: 'rn_supervisor',           label: 'RN Supervisor' },
] as const

const ROLE_LABEL: Record<string, string> = {
  company_owner:    'Agency Admin',
  care_coordinator: 'Care Coordinator',
}

// ——— Shared helpers ———————————————————————————————————————

function Avatar({ name, email, color = 'blue' }: { name?: string | null; email?: string; color?: 'blue' | 'purple' | 'teal' | 'gray' }) {
  const initial = (name || email || '?')[0].toUpperCase()
  const colors = {
    blue:   'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    teal:   'bg-teal-100 text-teal-700',
    gray:   'bg-gray-100 text-gray-500',
  }
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm ${colors[color]}`}>
      {initial}
    </div>
  )
}

function LoginBadge({ linked }: { linked: boolean }) {
  return linked
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Has login</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">No login</span>
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    inactive:  'bg-gray-100 text-gray-500',
    suspended: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function FieldInput({ label, value, onChange, placeholder, required, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; required?: boolean; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
      />
    </div>
  )
}

function SectionHeader({ icon: Icon, title, count, action, open, onToggle }: {
  icon: React.ElementType; title: string; count: number
  action?: React.ReactNode; open: boolean; onToggle: () => void
}) {
  return (
    <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-b border-gray-100">
      <button type="button" onClick={onToggle} className="flex items-center gap-2.5 flex-1 min-w-0">
        <Icon className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full">{count}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

// ——— Give Access modal ————————————————————————————————————

interface GiveAccessModalProps {
  isOpen: boolean
  onClose: () => void
  agencyId: string
  keyStaffId: string
  defaultName: string
  defaultEmail: string
  onSuccess: () => void
}

function GiveAccessModal({ isOpen, onClose, agencyId, keyStaffId, defaultName, defaultEmail, onSuccess }: GiveAccessModalProps) {
  const nameParts = defaultName.trim().split(/\s+/)
  const [firstName, setFirstName] = useState(nameParts.slice(0, -1).join(' ') || defaultName)
  const [lastName, setLastName]   = useState(nameParts.length > 1 ? nameParts[nameParts.length - 1] : '')
  const [email, setEmail]         = useState(defaultEmail)
  const [role, setRole]           = useState<'company_owner' | 'care_coordinator'>('company_owner')
  const [tempPassword, setTempPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const parts = defaultName.trim().split(/\s+/)
      setFirstName(parts.slice(0, -1).join(' ') || defaultName)
      setLastName(parts.length > 1 ? parts[parts.length - 1] : '')
      setEmail(defaultEmail)
      setRole('company_owner')
      setTempPassword('')
      setError(null)
    }
  }, [isOpen, defaultName, defaultEmail])

  const handleSubmit = async () => {
    if (!firstName.trim() || !email.trim() || !tempPassword.trim()) {
      setError('First name, email, and temporary password are required.')
      return
    }
    if (tempPassword.length < 8) {
      setError('Temporary password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await promoteKeyStaffToUser(keyStaffId, agencyId, role, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      tempPassword,
    })
    setSubmitting(false)
    if (result.error) { setError(result.error); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Give System Access" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Create a login account for this person. They will be able to sign in with their email and the temporary password you set.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="First Name" value={firstName} onChange={setFirstName} required />
          <FieldInput label="Last Name" value={lastName} onChange={setLastName} />
        </div>
        <FieldInput label="Email" type="email" value={email} onChange={setEmail} required />

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            System Role<span className="text-red-500 ml-0.5">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'company_owner',    label: 'Agency Admin',      desc: 'Full agency access' },
              { value: 'care_coordinator', label: 'Care Coordinator',  desc: 'Scheduling & coordination' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${role === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldInput
            label="Temporary Password"
            type="password"
            value={tempPassword}
            onChange={setTempPassword}
            placeholder="Min. 8 characters"
            required
          />
          <p className="text-xs text-gray-400 mt-1">Share this with the user — they should change it after first login.</p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {submitting ? 'Creating…' : 'Create Login'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ——— Key Staff section ———————————————————————————————————

function KeyStaffSection({ agencyId, keyStaff, admins, coordinators, onRefresh }: {
  agencyId: string
  keyStaff: AgencyKeyStaff[]
  admins: AdminRecord[]
  coordinators: CoordinatorRecord[]
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(true)
  const [giveAccessTo, setGiveAccessTo] = useState<AgencyKeyStaff | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const officers = keyStaff.filter(s => s.officer_role !== 'member_owner')
  const linkedUserIds = new Set([
    ...admins.map(a => a.user_id).filter(Boolean),
    ...coordinators.map(c => c.user_id).filter(Boolean),
  ])

  const officerLabel = (roleKey: string) =>
    OFFICER_ROLES.find(r => r.key === roleKey)?.label ?? roleKey.replace(/_/g, ' ')

  const linkedRoleLabel = (staff: AgencyKeyStaff) => {
    if (!staff.user_profile_id) return null
    const admin = admins.find(a => a.user_id === staff.user_profile_id)
    if (admin) return 'Agency Admin'
    const coord = coordinators.find(c => c.user_id === staff.user_profile_id)
    if (coord) return 'Care Coordinator'
    return 'System User'
  }

  const handleRemove = async (staffId: string) => {
    if (!confirm('Remove this key staff record?')) return
    setRemovingId(staffId)
    await removeKeyStaff(agencyId, staffId)
    setRemovingId(null)
    onRefresh()
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <SectionHeader
          icon={Users}
          title="Key Staff"
          count={officers.length}
          open={open}
          onToggle={() => setOpen(p => !p)}
        />

        {open && (
          <div className="divide-y divide-gray-50">
            {OFFICER_ROLES.map(({ key: roleKey, label }) => {
              const staff = keyStaff.find(s => s.officer_role === roleKey)
              const hasLogin = staff?.user_profile_id
                ? linkedUserIds.has(staff.user_profile_id)
                : false
              const roleName = staff ? linkedRoleLabel(staff) : null

              return (
                <div key={roleKey} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={staff?.full_legal_name} email={staff?.email ?? undefined} color={hasLogin ? 'blue' : 'gray'} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        {staff?.full_legal_name && (
                          <span className="text-sm text-gray-600 truncate">{staff.full_legal_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">
                          {staff ? 'informational' : 'not filled'}
                        </span>
                        {staff && roleName && (
                          <span className="text-xs text-gray-500">· {roleName}</span>
                        )}
                        {staff?.email && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            · <Mail className="w-3 h-3" /> {staff.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {staff && <LoginBadge linked={!!staff.user_profile_id} />}
                    {staff && !staff.user_profile_id && (
                      <button
                        type="button"
                        onClick={() => setGiveAccessTo(staff)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Give system login access"
                      >
                        <KeyRound className="w-3 h-3" />
                        Give Access
                      </button>
                    )}
                    {staff && (
                      <button
                        type="button"
                        onClick={() => handleRemove(staff.id)}
                        disabled={removingId === staff.id}
                        className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Remove"
                      >
                        {removingId === staff.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {giveAccessTo && (
        <GiveAccessModal
          isOpen
          onClose={() => setGiveAccessTo(null)}
          agencyId={agencyId}
          keyStaffId={giveAccessTo.id}
          defaultName={giveAccessTo.full_legal_name ?? ''}
          defaultEmail={giveAccessTo.email ?? ''}
          onSuccess={onRefresh}
        />
      )}
    </>
  )
}

// ——— Members / Owners section ————————————————————————————

function MembersOwnersSection({ agencyId, members, admins, coordinators, onRefresh }: {
  agencyId: string
  members: AgencyKeyStaff[]
  admins: AdminRecord[]
  coordinators: CoordinatorRecord[]
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(true)
  const [giveAccessTo, setGiveAccessTo] = useState<AgencyKeyStaff | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ full_legal_name: '', email: '', telephone: '', ownership_percentage: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const linkedUserIds = new Set([
    ...admins.map(a => a.user_id).filter(Boolean),
    ...coordinators.map(c => c.user_id).filter(Boolean),
  ])

  const handleRemove = async (staffId: string) => {
    if (!confirm('Remove this member/owner record?')) return
    setRemovingId(staffId)
    await removeKeyStaff(agencyId, staffId)
    setRemovingId(null)
    onRefresh()
  }

  const handleAdd = async () => {
    if (!addForm.full_legal_name.trim()) { setAddError('Full legal name is required.'); return }
    setAdding(true)
    setAddError(null)
    const result = await addMemberOwner(agencyId, {
      full_legal_name: addForm.full_legal_name.trim(),
      email: addForm.email.trim(),
      telephone: addForm.telephone.trim(),
      ownership_percentage: addForm.ownership_percentage.trim(),
    })
    setAdding(false)
    if (result.error) { setAddError(result.error); return }
    setShowAdd(false)
    setAddForm({ full_legal_name: '', email: '', telephone: '', ownership_percentage: '' })
    onRefresh()
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <SectionHeader
          icon={Users}
          title="Members / Owners"
          count={members.length}
          open={open}
          onToggle={() => setOpen(p => !p)}
          action={
            <button
              type="button"
              onClick={() => { setShowAdd(p => !p); setAddError(null) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Member/Owner
            </button>
          }
        />

        {open && (
          <div>
            {showAdd && (
              <div className="mx-5 mb-4 mt-3 p-4 border border-dashed border-blue-200 rounded-lg bg-blue-50/40">
                <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">New Member / Owner</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput label="Full Legal Name" value={addForm.full_legal_name} onChange={v => setAddForm(p => ({ ...p, full_legal_name: v }))} required />
                    <FieldInput label="Ownership %" value={addForm.ownership_percentage} onChange={v => setAddForm(p => ({ ...p, ownership_percentage: v }))} placeholder="e.g. 25" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput label="Email" type="email" value={addForm.email} onChange={v => setAddForm(p => ({ ...p, email: v }))} />
                    <FieldInput label="Phone" value={addForm.telephone} onChange={v => setAddForm(p => ({ ...p, telephone: v }))} />
                  </div>
                </div>
                {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={adding}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {adding ? 'Adding…' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                </div>
              </div>
            )}

            {members.length === 0 && !showAdd ? (
              <p className="px-5 py-4 text-sm text-gray-400 italic">No members/owners on file.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {members.map(m => {
                  const hasLogin = m.user_profile_id ? linkedUserIds.has(m.user_profile_id) : false
                  return (
                    <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={m.full_legal_name} email={m.email ?? undefined} color={hasLogin ? 'blue' : 'gray'} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.full_legal_name || 'Unnamed'}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {m.ownership_percentage && (
                              <span className="text-xs text-gray-500">{m.ownership_percentage}% ownership</span>
                            )}
                            {m.email && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {m.email}
                              </span>
                            )}
                            {m.telephone && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {m.telephone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <LoginBadge linked={!!m.user_profile_id} />
                        {!m.user_profile_id && (
                          <button
                            type="button"
                            onClick={() => setGiveAccessTo(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <KeyRound className="w-3 h-3" />
                            Give Access
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemove(m.id)}
                          disabled={removingId === m.id}
                          className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Remove"
                        >
                          {removingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {giveAccessTo && (
        <GiveAccessModal
          isOpen
          onClose={() => setGiveAccessTo(null)}
          agencyId={agencyId}
          keyStaffId={giveAccessTo.id}
          defaultName={giveAccessTo.full_legal_name ?? ''}
          defaultEmail={giveAccessTo.email ?? ''}
          onSuccess={onRefresh}
        />
      )}
    </>
  )
}

// ——— Agency Users section (Admins + Coordinators with no key_staff link) ——

function AgencyUsersSection({ agencyId, admins, coordinators, linkedUserIds, onRefresh }: {
  agencyId: string
  admins: AdminRecord[]
  coordinators: CoordinatorRecord[]
  linkedUserIds: Set<string>
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createType, setCreateType] = useState<'company_owner' | 'care_coordinator'>('company_owner')
  const [createForm, setCreateForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [settingsItem, setSettingsItem] = useState<{ type: 'admin' | 'coordinator'; id: string; userId: string | null; name: string; email: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)

  // Only show users NOT already linked via a key_staff record
  const unlinkedAdmins = admins.filter(a => !a.user_id || !linkedUserIds.has(a.user_id))
  const unlinkedCoords = coordinators.filter(c => !c.user_id || !linkedUserIds.has(c.user_id))
  const total = unlinkedAdmins.length + unlinkedCoords.length

  const handleToggleAdmin = async (admin: AdminRecord) => {
    const next = (admin.status ?? 'active') === 'active' ? 'inactive' : 'active'
    setTogglingId(admin.id)
    await updateAgencyAdminStatus(agencyId, admin.id, next)
    setTogglingId(null)
    onRefresh()
  }

  const handleToggleCoord = async (coord: CoordinatorRecord) => {
    const next = coord.status === 'active' ? 'inactive' : 'active'
    setTogglingId(coord.id)
    await updateCareCoordinatorStatus(agencyId, coord.id, next)
    setTogglingId(null)
    onRefresh()
  }

  const handleCreate = async () => {
    if (!createForm.firstName.trim() || !createForm.lastName.trim() || !createForm.email.trim()) {
      setCreateError('First name, last name, and email are required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    const opts = { firstName: createForm.firstName.trim(), lastName: createForm.lastName.trim(), email: createForm.email.trim(), phone: createForm.phone.trim() || undefined }
    const result = createType === 'company_owner'
      ? await createAndLinkAgencyAdmin(agencyId, opts)
      : await addCareCoordinatorForAgency(agencyId, opts)
    setCreating(false)
    if (result.error) { setCreateError(result.error); return }
    setShowCreate(false)
    setCreateForm({ firstName: '', lastName: '', email: '', phone: '' })
    onRefresh()
  }

  const openAdminSettings = (admin: AdminRecord) => {
    setSettingsItem({ type: 'admin', id: admin.id, userId: admin.user_id, name: admin.contact_name ?? '', email: admin.contact_email ?? '' })
    setEditName(admin.contact_name ?? '')
    setEditPhone(admin.contact_phone ?? '')
    setEditError(null)
  }

  const openCoordSettings = (coord: CoordinatorRecord) => {
    setSettingsItem({ type: 'coordinator', id: coord.id, userId: coord.user_id, name: `${coord.first_name} ${coord.last_name}`, email: coord.email })
    setEditFirst(coord.first_name)
    setEditLast(coord.last_name)
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!settingsItem) return
    setSavingEdit(true)
    setEditError(null)
    let result: { error: string | null }
    if (settingsItem.type === 'admin') {
      if (!editName.trim()) { setEditError('Name is required.'); setSavingEdit(false); return }
      result = await updateAgencyAdminProfile(agencyId, settingsItem.id, { contact_name: editName.trim(), contact_phone: editPhone.trim() || undefined })
    } else {
      if (!editFirst.trim() || !editLast.trim()) { setEditError('Name is required.'); setSavingEdit(false); return }
      result = await updateCareCoordinatorProfile(agencyId, settingsItem.id, { first_name: editFirst.trim(), last_name: editLast.trim() })
    }
    setSavingEdit(false)
    if (result.error) { setEditError(result.error); return }
    setSettingsItem(null)
    onRefresh()
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <SectionHeader
          icon={Shield}
          title="Agency Users"
          count={total}
          open={open}
          onToggle={() => setOpen(p => !p)}
          action={
            <button
              type="button"
              onClick={() => { setShowCreate(p => !p); setCreateError(null) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add User
            </button>
          }
        />

        {open && (
          <div>
            {showCreate && (
              <div className="mx-5 mb-4 mt-3 p-4 border border-dashed border-blue-200 rounded-lg bg-blue-50/40">
                <div className="flex gap-2 mb-3">
                  {([
                    { value: 'company_owner', label: 'Agency Admin' },
                    { value: 'care_coordinator', label: 'Care Coordinator' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCreateType(opt.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${createType === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput label="First Name" value={createForm.firstName} onChange={v => setCreateForm(p => ({ ...p, firstName: v }))} required />
                    <FieldInput label="Last Name" value={createForm.lastName} onChange={v => setCreateForm(p => ({ ...p, lastName: v }))} required />
                  </div>
                  <FieldInput label="Email" type="email" value={createForm.email} onChange={v => setCreateForm(p => ({ ...p, email: v }))} required />
                  {createType === 'company_owner' && (
                    <FieldInput label="Phone (optional)" value={createForm.phone} onChange={v => setCreateForm(p => ({ ...p, phone: v }))} placeholder="e.g. 555-123-4567" />
                  )}
                </div>
                {createError && <p className="mt-2 text-xs text-red-600">{createError}</p>}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {creating ? 'Creating…' : 'Create Account'}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                </div>
              </div>
            )}

            {total === 0 && !showCreate ? (
              <p className="px-5 py-4 text-sm text-gray-400 italic">No agency users without a regulatory role.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {unlinkedAdmins.map(admin => {
                  const isActive = (admin.status ?? 'active') === 'active'
                  return (
                    <div key={admin.id} className={`px-5 py-3 flex items-center justify-between gap-3 ${!isActive ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={admin.contact_name} email={admin.contact_email ?? undefined} color="purple" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{admin.contact_name || 'Unnamed Admin'}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-xs text-gray-400">Agency Admin</span>
                            {admin.contact_email && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                · <Mail className="w-3 h-3" /> {admin.contact_email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {admin.status && <StatusBadge status={admin.status} />}
                        <button
                          type="button"
                          onClick={() => handleToggleAdmin(admin)}
                          disabled={togglingId === admin.id}
                          className={`${isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'} disabled:opacity-50 transition-colors`}
                          title={isActive ? 'Disable' : 'Enable'}
                        >
                          {togglingId === admin.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={() => openAdminSettings(admin)} className="text-blue-600 hover:text-blue-800 transition-colors"><Settings className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                })}
                {unlinkedCoords.map(coord => {
                  const isActive = coord.status === 'active'
                  return (
                    <div key={coord.id} className={`px-5 py-3 flex items-center justify-between gap-3 ${!isActive ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={`${coord.first_name} ${coord.last_name}`} email={coord.email} color="blue" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{coord.first_name} {coord.last_name}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-xs text-gray-400">Care Coordinator</span>
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              · <Mail className="w-3 h-3" /> {coord.email}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={coord.status} />
                        <button
                          type="button"
                          onClick={() => handleToggleCoord(coord)}
                          disabled={togglingId === coord.id}
                          className={`${isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'} disabled:opacity-50 transition-colors`}
                          title={isActive ? 'Disable' : 'Enable'}
                        >
                          {togglingId === coord.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={() => openCoordSettings(coord)} className="text-blue-600 hover:text-blue-800 transition-colors"><Settings className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings modal */}
      <Modal isOpen={!!settingsItem} onClose={() => { setSettingsItem(null); setEditError(null) }} title="User Settings" size="md">
        {settingsItem && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Edit Profile</h3>
              <div className="space-y-3">
                {settingsItem.type === 'admin' ? (
                  <>
                    <FieldInput label="Full Name" value={editName} onChange={setEditName} required />
                    <FieldInput label="Phone (optional)" value={editPhone} onChange={setEditPhone} placeholder="e.g. 555-123-4567" />
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput label="First Name" value={editFirst} onChange={setEditFirst} required />
                    <FieldInput label="Last Name" value={editLast} onChange={setEditLast} required />
                  </div>
                )}
              </div>
              {editError && <p className="mt-2 text-xs text-red-600">{editError}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
            <div className="border-t border-gray-200" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Password</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {settingsItem.userId ? 'Set a new password for this user.' : 'No system account linked.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => settingsItem.userId && setPasswordOpen(true)}
                disabled={!settingsItem.userId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Change Password
              </button>
            </div>
          </div>
        )}
      </Modal>

      {settingsItem?.userId && (
        <ResetPasswordModal
          isOpen={passwordOpen}
          onClose={() => setPasswordOpen(false)}
          userName={settingsItem.name}
          userEmail={settingsItem.email}
          userId={settingsItem.userId}
        />
      )}
    </>
  )
}

// ——— Main component ——————————————————————————————————————

export default function AgencyPeopleTab({ agencyId }: { agencyId: string }) {
  const [keyStaff, setKeyStaff] = useState<AgencyKeyStaff[]>([])
  const [admins, setAdmins] = useState<AdminRecord[]>([])
  const [coordinators, setCoordinators] = useState<CoordinatorRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()

    const [staffRes, adminsRes, coordsRes] = await Promise.all([
      supabase
        .from('agency_key_staff')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('status', 'active')
        .order('created_at', { ascending: true }),
      supabase
        .from('agency_admins')
        .select('id, user_id, contact_name, contact_email, contact_phone, status')
        .eq('agency_id', agencyId)
        .order('contact_name', { ascending: true }),
      supabase
        .from('care_coordinators')
        .select('id, user_id, first_name, last_name, email, status')
        .eq('agency_id', agencyId)
        .order('first_name', { ascending: true }),
    ])

    const err = staffRes.error || adminsRes.error || coordsRes.error
    if (err) {
      setFetchError(err.message)
    } else {
      setKeyStaff((staffRes.data ?? []) as AgencyKeyStaff[])
      setAdmins((adminsRes.data ?? []) as AdminRecord[])
      setCoordinators((coordsRes.data ?? []) as CoordinatorRecord[])
    }
    setLoading(false)
  }, [agencyId])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm flex items-center justify-between gap-3">
        <span>Failed to load people: {fetchError}</span>
        <button type="button" onClick={fetchData} className="text-red-600 hover:text-red-800 underline text-xs">Retry</button>
      </div>
    )
  }

  const officers    = keyStaff.filter(s => s.officer_role !== 'member_owner')
  const members     = keyStaff.filter(s => s.officer_role === 'member_owner')

  // User IDs already linked via key_staff records — used to filter the Agency Users section
  const linkedUserIds = new Set<string>(
    keyStaff.map(s => s.user_profile_id).filter((id): id is string => !!id)
  )

  const totalPeople = admins.length + coordinators.length + keyStaff.length
  const User_ = User

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User_ className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">{totalPeople} people</span>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <KeyStaffSection
        agencyId={agencyId}
        keyStaff={officers}
        admins={admins}
        coordinators={coordinators}
        onRefresh={fetchData}
      />

      <MembersOwnersSection
        agencyId={agencyId}
        members={members}
        admins={admins}
        coordinators={coordinators}
        onRefresh={fetchData}
      />

      <AgencyUsersSection
        agencyId={agencyId}
        admins={admins}
        coordinators={coordinators}
        linkedUserIds={linkedUserIds}
        onRefresh={fetchData}
      />
    </div>
  )
}
