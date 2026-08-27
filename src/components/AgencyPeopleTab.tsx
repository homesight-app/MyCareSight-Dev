'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, UserPlus, Loader2, RefreshCw, Search, ChevronDown, KeyRound,
} from 'lucide-react'
import Modal from './Modal'
import ResetPasswordModal from './ResetPasswordModal'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import { useTableState } from '@/hooks/useTableState'
import TablePagination from '@/components/ui/TablePagination'
import {
  updateAgencyAdminStatus,
  updateCareCoordinatorStatus,
  updateAgencyAdminProfile,
  updateCareCoordinatorProfile,
  createAndLinkAgencyAdmin,
  addCareCoordinatorForAgency,
  promoteKeyStaffToUser,
} from '@/app/actions/agency-users'
import { updateKeyStaffById, addKeyStaffWithRoles } from '@/app/actions/agency-onboarding'
import { getPeopleForAgency, type RawKeyStaff, type RawAdmin, type RawCoordinator } from '@/app/actions/agency-people'
import { changePersonCredential } from '@/app/actions/agency-users'

// ——— Constants ————————————————————————————————————————————

const OFFICER_ROLES = [
  { key: 'president',               label: 'President' },
  { key: 'vice_president',          label: 'Vice President' },
  { key: 'secretary',               label: 'Secretary' },
  { key: 'treasurer_cfo',           label: 'Treasurer / CFO' },
  { key: 'administrator',           label: 'Administrator' },
  { key: 'alternate_administrator', label: 'Alternate Administrator' },
  { key: 'rn_supervisor',           label: 'RN Supervisor' },
  { key: 'member_owner',            label: 'Member / Owner' },
] as const

type OfficerRoleKey = typeof OFFICER_ROLES[number]['key']

const OFFICER_ROLE_LABEL: Record<string, string> = Object.fromEntries(
  OFFICER_ROLES.map(r => [r.key, r.label])
)

const CREDENTIAL_LABEL: Record<string, string> = {
  company_owner:    'Agency Admin',
  care_coordinator: 'Care Coordinator',
}

// ——— Data types ————————————————————————————————————————————

interface PersonRow {
  rowKey: string
  keyStaffId: string | null
  firstName: string
  lastName: string
  fullName: string
  officerRole: string | null        // legacy primary role — kept for backward compat
  officerRoles: string[]            // all roles (multi-role)
  ownershipPercentage: string | null
  phone: string | null
  email: string | null
  userProfileId: string | null
  credential: 'company_owner' | 'care_coordinator' | null
  adminRecordId: string | null
  coordinatorRecordId: string | null
  status: 'active' | 'inactive' | 'suspended'
}

function splitName(full: string | null): { firstName: string; lastName: string } {
  if (!full?.trim()) return { firstName: '', lastName: '' }
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

function buildPeopleRows(
  keyStaff: RawKeyStaff[],
  admins: RawAdmin[],
  coordinators: RawCoordinator[]
): PersonRow[] {
  const adminByUserId = new Map(admins.map(a => [a.user_id, a]))
  const coordByUserId = new Map(coordinators.map(c => [c.user_id, c]))
  const linkedUserIds = new Set<string>()

  const rows: PersonRow[] = keyStaff.map(s => {
    const admin = s.user_profile_id ? adminByUserId.get(s.user_profile_id) : undefined
    const coord = s.user_profile_id ? coordByUserId.get(s.user_profile_id) : undefined
    const credential = admin ? 'company_owner' : coord ? 'care_coordinator' : null
    if (s.user_profile_id) linkedUserIds.add(s.user_profile_id)
    const { firstName, lastName } = splitName(s.full_legal_name)
    // Prefer the array; fall back to single role for rows not yet backfilled
    const officerRoles = s.officer_roles?.length ? s.officer_roles : (s.officer_role ? [s.officer_role] : [])
    return {
      rowKey: `ks-${s.id}`,
      keyStaffId: s.id,
      firstName,
      lastName,
      fullName: s.full_legal_name ?? '',
      officerRole: s.officer_role,
      officerRoles,
      ownershipPercentage: s.ownership_percentage,
      phone: s.telephone,
      email: s.email,
      userProfileId: s.user_profile_id,
      credential,
      adminRecordId: admin?.id ?? null,
      coordinatorRecordId: coord?.id ?? null,
      status: (s.status as PersonRow['status']) ?? 'active',
    }
  })

  for (const a of admins) {
    if (a.user_id && linkedUserIds.has(a.user_id)) continue
    const { firstName, lastName } = splitName(a.contact_name)
    rows.push({
      rowKey: `adm-${a.id}`,
      keyStaffId: null,
      firstName,
      lastName,
      fullName: a.contact_name ?? '',
      officerRole: null,
      officerRoles: [],
      ownershipPercentage: null,
      phone: a.contact_phone,
      email: a.contact_email,
      userProfileId: a.user_id,
      credential: 'company_owner',
      adminRecordId: a.id,
      coordinatorRecordId: null,
      status: (a.status as PersonRow['status']) ?? 'active',
    })
  }

  for (const c of coordinators) {
    if (c.user_id && linkedUserIds.has(c.user_id)) continue
    rows.push({
      rowKey: `coord-${c.id}`,
      keyStaffId: null,
      firstName: c.first_name,
      lastName: c.last_name,
      fullName: `${c.first_name} ${c.last_name}`.trim(),
      officerRole: null,
      officerRoles: [],
      ownershipPercentage: null,
      phone: null,
      email: c.email,
      userProfileId: c.user_id,
      credential: 'care_coordinator',
      adminRecordId: null,
      coordinatorRecordId: c.id,
      status: (c.status as PersonRow['status']) ?? 'active',
    })
  }

  return rows
}

// ——— Give Access modal (reused) ————————————————————————————

interface GiveAccessModalProps {
  isOpen: boolean
  onClose: () => void
  agencyId: string
  person: PersonRow
  onSuccess: () => void
}

function GiveAccessModal({ isOpen, onClose, agencyId, person, onSuccess }: GiveAccessModalProps) {
  const [firstName, setFirstName] = useState(person.firstName)
  const [lastName, setLastName]   = useState(person.lastName)
  const [email, setEmail]         = useState(person.email ?? '')
  const [role, setRole]           = useState<'company_owner' | 'care_coordinator'>('company_owner')
  const [tempPassword, setTempPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setFirstName(person.firstName)
      setLastName(person.lastName)
      setEmail(person.email ?? '')
      setRole('company_owner')
      setTempPassword('')
      setError(null)
    }
  }, [isOpen, person])

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
    const result = await promoteKeyStaffToUser(person.keyStaffId!, agencyId, role, {
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
              { value: 'company_owner',    label: 'Agency Admin',     desc: 'Full agency access' },
              { value: 'care_coordinator', label: 'Care Coordinator', desc: 'Scheduling & coordination' },
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
          <FieldInput label="Temporary Password" type="password" value={tempPassword} onChange={setTempPassword} placeholder="Min. 8 characters" required />
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

// ——— Add Person modal ——————————————————————————————————————

interface AddPersonModalProps {
  isOpen: boolean
  onClose: () => void
  agencyId: string
  onSuccess: () => void
}

function AddPersonModal({ isOpen, onClose, agencyId, onSuccess }: AddPersonModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [officerRoles, setOfficerRoles] = useState<OfficerRoleKey[]>([])
  const [ownershipPct, setOwnershipPct] = useState('')
  const [phone, setPhone]         = useState('')
  const [email, setEmail]         = useState('')
  const [createLogin, setCreateLogin] = useState(false)
  const [credential, setCredential]   = useState<'company_owner' | 'care_coordinator'>('company_owner')
  const [tempPassword, setTempPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setFirstName(''); setLastName(''); setOfficerRoles([]); setOwnershipPct('')
    setPhone(''); setEmail(''); setCreateLogin(false)
    setCredential('company_owner'); setTempPassword(''); setError(null)
  }, [isOpen])

  const toggleRole = (key: OfficerRoleKey) => {
    setOfficerRoles(prev =>
      prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key]
    )
  }

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return }
    if (createLogin && !email.trim()) { setError('Email is required when creating a login.'); return }
    if (createLogin && tempPassword.length < 8) { setError('Temporary password must be at least 8 characters.'); return }
    setSubmitting(true)
    setError(null)

    const fullName = `${firstName.trim()} ${lastName.trim()}`
    let staffId: string | null = null

    if (officerRoles.length > 0) {
      const res = await addKeyStaffWithRoles(agencyId, {
        officer_roles: officerRoles,
        full_legal_name: fullName,
        telephone: phone.trim() || undefined,
        email: email.trim() || undefined,
        ownership_percentage: officerRoles.includes('member_owner') ? (ownershipPct.trim() || undefined) : undefined,
      })
      if (res.error) { setError(res.error); setSubmitting(false); return }
      staffId = res.data?.id ?? null
    }

    if (createLogin) {
      if (staffId) {
        const res = await promoteKeyStaffToUser(staffId, agencyId, credential, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          tempPassword,
        })
        if (res.error) { setError(res.error); setSubmitting(false); return }
      } else {
        const res = credential === 'company_owner'
          ? await createAndLinkAgencyAdmin(agencyId, { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() || undefined })
          : await addCareCoordinatorForAgency(agencyId, { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() })
        if (res.error) { setError(res.error); setSubmitting(false); return }
      }
    }

    setSubmitting(false)
    onSuccess()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Person" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="First Name" value={firstName} onChange={setFirstName} required />
          <FieldInput label="Last Name" value={lastName} onChange={setLastName} required />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Officer Role(s)</label>
          <div className="grid grid-cols-2 gap-1.5">
            {OFFICER_ROLES.map(r => (
              <label key={r.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors select-none">
                <input
                  type="checkbox"
                  checked={officerRoles.includes(r.key)}
                  onChange={() => toggleRole(r.key)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700">{r.label}</span>
              </label>
            ))}
          </div>
          {officerRoles.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">No role selected — person will be added as a contact only.</p>
          )}
        </div>

        {officerRoles.includes('member_owner') && (
          <FieldInput label="Ownership %" value={ownershipPct} onChange={setOwnershipPct} placeholder="e.g. 25" />
        )}

        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Phone" value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
          <FieldInput label="Email" type="email" value={email} onChange={setEmail} />
        </div>

        <div className="border-t border-gray-100 pt-3">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createLogin}
              onChange={e => setCreateLogin(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Create system login for this person</span>
          </label>
        </div>

        {createLogin && (
          <div className="space-y-3 bg-blue-50/50 rounded-lg p-3 border border-blue-100">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">System Role<span className="text-red-500 ml-0.5">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'company_owner',    label: 'Agency Admin',     desc: 'Full agency access' },
                  { value: 'care_coordinator', label: 'Care Coordinator', desc: 'Scheduling & coordination' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCredential(opt.value)}
                    className={`text-left px-3 py-2 rounded-lg border-2 transition-colors ${credential === opt.value ? 'border-blue-500 bg-white' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    <p className="text-xs font-semibold text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <FieldInput label="Temporary Password" type="password" value={tempPassword} onChange={setTempPassword} placeholder="Min. 8 characters" required />
            <p className="text-xs text-gray-400">Share this with the user — they should change it after first login.</p>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'Adding…' : 'Add Person'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ——— Edit Person modal ———————————————————————————————————

interface EditPersonModalProps {
  isOpen: boolean
  onClose: () => void
  agencyId: string
  person: PersonRow
  onSuccess: () => void
}

function EditPersonModal({ isOpen, onClose, agencyId, person, onSuccess }: EditPersonModalProps) {
  const [firstName, setFirstName]       = useState(person.firstName)
  const [lastName, setLastName]         = useState(person.lastName)
  const [phone, setPhone]               = useState(person.phone ?? '')
  const [email, setEmail]               = useState(person.email ?? '')
  const [officerRoles, setOfficerRoles] = useState<string[]>(person.officerRoles)
  const [credential, setCredential]     = useState<'company_owner' | 'care_coordinator' | ''>(person.credential ?? '')
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFirstName(person.firstName)
      setLastName(person.lastName)
      setPhone(person.phone ?? '')
      setEmail(person.email ?? '')
      setOfficerRoles(person.officerRoles)
      setCredential(person.credential ?? '')
      setError(null)
    }
  }, [isOpen, person])

  const toggleRole = (key: string) => {
    setOfficerRoles(prev =>
      prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key]
    )
  }

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return }
    setSubmitting(true)
    setError(null)
    const fullName = `${firstName.trim()} ${lastName.trim()}`

    if (person.keyStaffId) {
      const res = await updateKeyStaffById(agencyId, person.keyStaffId, {
        full_legal_name: fullName,
        telephone: phone.trim() || undefined,
        email: email.trim() || undefined,
        officer_roles: officerRoles,
        officer_role: officerRoles[0] ?? null,
      })
      if (res.error) { setError(res.error); setSubmitting(false); return }
    }
    if (person.adminRecordId && credential !== 'care_coordinator') {
      const res = await updateAgencyAdminProfile(agencyId, person.adminRecordId, {
        contact_name: fullName,
        contact_phone: phone.trim() || undefined,
      })
      if (res.error) { setError(res.error); setSubmitting(false); return }
    }
    if (person.coordinatorRecordId && credential !== 'company_owner') {
      const res = await updateCareCoordinatorProfile(agencyId, person.coordinatorRecordId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      if (res.error) { setError(res.error); setSubmitting(false); return }
    }

    // Credential change
    if (credential && credential !== person.credential && person.userProfileId) {
      const res = await changePersonCredential(agencyId, {
        userProfileId: person.userProfileId,
        adminRecordId: person.adminRecordId,
        coordinatorRecordId: person.coordinatorRecordId,
        toCredential: credential,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      })
      if (res.error) { setError(res.error); setSubmitting(false); return }
    }

    setSubmitting(false)
    onSuccess()
    onClose()
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Edit Person" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="First Name" value={firstName} onChange={setFirstName} required />
            <FieldInput label="Last Name" value={lastName} onChange={setLastName} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Phone" value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
            <FieldInput label="Email" type="email" value={email} onChange={setEmail} />
          </div>

          {person.keyStaffId && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Officer Role(s)</label>
              <div className="grid grid-cols-2 gap-1.5">
                {OFFICER_ROLES.map(r => (
                  <label key={r.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors select-none">
                    <input
                      type="checkbox"
                      checked={officerRoles.includes(r.key)}
                      onChange={() => toggleRole(r.key)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-700">{r.label}</span>
                  </label>
                ))}
              </div>
              {officerRoles.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">No role selected — person is a contact only.</p>
              )}
            </div>
          )}

          {person.credential && (
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">System Credential</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'company_owner',    label: 'Agency Admin',     desc: 'Full agency access' },
                    { value: 'care_coordinator', label: 'Care Coordinator', desc: 'Scheduling & coordination' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCredential(opt.value)}
                      className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${credential === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
                {credential !== person.credential && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    This will change the user&apos;s system access level.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Password</p>
                  <p className="text-xs text-gray-500 mt-0.5">Set a new password for this user.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Change Password
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {person.userProfileId && (
        <ResetPasswordModal
          isOpen={passwordOpen}
          onClose={() => setPasswordOpen(false)}
          userName={person.fullName}
          userEmail={person.email ?? ''}
          userId={person.userProfileId}
        />
      )}
    </>
  )
}

// ——— Shared helpers ———————————————————————————————————————

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

function CredentialBadge({ credential }: { credential: string | null }) {
  if (!credential) return <span className="text-gray-400 text-sm">—</span>
  const styles: Record<string, string> = {
    company_owner:    'bg-purple-100 text-purple-700',
    care_coordinator: 'bg-teal-100 text-teal-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[credential] ?? 'bg-gray-100 text-gray-600'}`}>
      {CREDENTIAL_LABEL[credential] ?? credential}
    </span>
  )
}

function StatusBadge({ row }: { row: PersonRow }) {
  if (!row.credential) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Contact</span>
  }
  const isActive = row.status === 'active'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

// ——— Main component ——————————————————————————————————————

export default function AgencyPeopleTab({ agencyId }: { agencyId: string }) {
  const [rows, setRows]         = useState<PersonRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [roleFilter, setRoleFilter]           = useState('')
  const [credentialFilter, setCredentialFilter] = useState('')
  const [statusTab, setStatusTab] = useState<'active' | 'inactive'>('active')

  const { search, setSearch, sort, setSort, page, setPage, pageSize, resetPage, applySortedData, applyPageSlice } = useTableState({
    defaultSort: { key: 'name', dir: 'asc' },
  })

  const [addOpen, setAddOpen]         = useState(false)
  const [editPerson, setEditPerson]   = useState<PersonRow | null>(null)
  const [accessPerson, setAccessPerson] = useState<PersonRow | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const result = await getPeopleForAgency(agencyId)
    if (result.error) {
      setFetchError(result.error)
    } else {
      setRows(buildPeopleRows(result.keyStaff, result.admins, result.coordinators))
    }
    setLoading(false)
  }, [agencyId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleToggle = async (row: PersonRow) => {
    if (!row.credential) return
    const next = row.status === 'active' ? 'inactive' : 'active'
    setRows((prev) => prev.map((r) => r.rowKey === row.rowKey ? { ...r, status: next } : r))
    setTogglingId(row.rowKey)
    if (row.adminRecordId) {
      await updateAgencyAdminStatus(agencyId, row.adminRecordId, next)
    } else if (row.coordinatorRecordId) {
      await updateCareCoordinatorStatus(agencyId, row.coordinatorRecordId, next)
    }
    setTogglingId(null)
    fetchData()
  }

  const sortFn = useCallback(
    (key: string, dir: 'asc' | 'desc') => (a: PersonRow, b: PersonRow): number => {
      const mul = dir === 'asc' ? 1 : -1
      if (key === 'name') return mul * a.fullName.localeCompare(b.fullName)
      if (key === 'role') return mul * (a.officerRoles[0] ?? '').localeCompare(b.officerRoles[0] ?? '')
      return 0
    },
    []
  )

  const inactiveCount = useMemo(
    () => rows.filter(r => !!r.credential && r.status !== 'active').length,
    [rows]
  )

  const filtered = useMemo(() => {
    let result = rows
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.fullName.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)
      )
    }
    if (roleFilter === '__none__') result = result.filter(r => r.officerRoles.length === 0)
    else if (roleFilter) result = result.filter(r => r.officerRoles.includes(roleFilter))
    if (credentialFilter === '__none__') result = result.filter(r => !r.credential)
    else if (credentialFilter) result = result.filter(r => r.credential === credentialFilter)
    if (statusTab === 'active') {
      result = result.filter(r => !r.credential || r.status === 'active')
    } else {
      result = result.filter(r => !!r.credential && r.status !== 'active')
    }
    return applySortedData(result, sortFn)
  }, [rows, search, roleFilter, credentialFilter, statusTab, applySortedData, sortFn])

  const { slice: pageRows, totalCount } = applyPageSlice(filtered)

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

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => { setStatusTab('active'); resetPage() }}
            aria-pressed={statusTab === 'active'}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              statusTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => { setStatusTab('inactive'); resetPage() }}
            aria-pressed={statusTab === 'inactive'}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              statusTab === 'inactive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Person
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); resetPage() }}
            className="pl-3 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none bg-white"
          >
            <option value="">All Roles</option>
            {OFFICER_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            <option value="__none__">No Role</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="relative">
          <select
            value={credentialFilter}
            onChange={e => { setCredentialFilter(e.target.value); resetPage() }}
            className="pl-3 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none bg-white"
          >
            <option value="">All Credentials</option>
            <option value="company_owner">Agency Admin</option>
            <option value="care_coordinator">Care Coordinator</option>
            <option value="__none__">No Credential</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {pageRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400 italic">
            {rows.length === 0 ? 'No people associated with this agency yet.' : 'No people match the current filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="w-10 px-2 py-2.5" />
                  <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
                  <SortableColumnHeader label="Role" sortKey="role" currentSort={sort} onSort={setSort} />
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Credential</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageRows.map(row => {
                  const isInactive = row.status !== 'active'
                  const isToggling = togglingId === row.rowKey
                  return (
                    <tr key={row.rowKey} className="hover:bg-gray-50/50 transition-colors">
                      <td className="w-10 px-2 py-3">
                        <RecordActionsMenu
                          label={`Actions for ${row.fullName || 'person'}`}
                          actions={[
                            {
                              label: 'Edit Person',
                              onClick: () => setEditPerson(row),
                            },
                            {
                              label: 'Give System Access',
                              icon: KeyRound,
                              onClick: () => setAccessPerson(row),
                              hidden: !row.keyStaffId || !!row.credential,
                            },
                            {
                              label: isToggling ? 'Updating…' : row.status === 'active' ? 'Deactivate' : 'Activate',
                              onClick: () => handleToggle(row),
                              destructive: row.status === 'active',
                              positive: row.status !== 'active',
                              hidden: !row.credential,
                            },
                          ]}
                        />
                      </td>
                      <td className={`px-4 py-3 ${isInactive ? 'opacity-60' : ''}`}>
                        <p className="font-medium text-gray-900">{row.fullName || '—'}</p>
                      </td>
                      <td className={`px-4 py-3 ${isInactive ? 'opacity-60' : ''}`}>
                        {row.officerRoles.length > 0
                          ? <div className="flex flex-wrap gap-1">
                              {row.officerRoles.map(role => (
                                <span key={role} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                  {OFFICER_ROLE_LABEL[role] ?? role}
                                </span>
                              ))}
                            </div>
                          : <span className="text-gray-400 text-sm">—</span>
                        }
                      </td>
                      <td className={`px-4 py-3 hidden sm:table-cell text-sm text-gray-700 ${isInactive ? 'opacity-60' : ''}`}>{row.phone || <span className="text-gray-400">—</span>}</td>
                      <td className={`px-4 py-3 hidden md:table-cell text-sm text-gray-700 ${isInactive ? 'opacity-60' : ''}`}>{row.email || <span className="text-gray-400">—</span>}</td>
                      <td className={`px-4 py-3 ${isInactive ? 'opacity-60' : ''}`}><CredentialBadge credential={row.credential} /></td>
                      <td className="px-4 py-3"><StatusBadge row={row} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalCount > pageSize && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          entityLabel="people"
        />
      )}

      {/* Modals */}
      <AddPersonModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        agencyId={agencyId}
        onSuccess={fetchData}
      />

      {editPerson && (
        <EditPersonModal
          isOpen
          onClose={() => setEditPerson(null)}
          agencyId={agencyId}
          person={editPerson}
          onSuccess={() => { setEditPerson(null); fetchData() }}
        />
      )}

      {accessPerson && (
        <GiveAccessModal
          isOpen
          onClose={() => setAccessPerson(null)}
          agencyId={agencyId}
          person={accessPerson}
          onSuccess={() => { setAccessPerson(null); fetchData() }}
        />
      )}
    </div>
  )
}
