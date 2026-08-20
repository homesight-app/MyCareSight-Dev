'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, UserPlus, Loader2, KeyRound, Pencil, RefreshCw, Search,
  ChevronDown,
} from 'lucide-react'
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
import { saveKeyStaffAdmin, addMemberOwner, updateKeyStaffById } from '@/app/actions/agency-onboarding'
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
  officerRole: string | null
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
    return {
      rowKey: `ks-${s.id}`,
      keyStaffId: s.id,
      firstName,
      lastName,
      fullName: s.full_legal_name ?? '',
      officerRole: s.officer_role,
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
  const [officerRole, setOfficerRole] = useState<OfficerRoleKey | ''>('')
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
    setFirstName(''); setLastName(''); setOfficerRole(''); setOwnershipPct('')
    setPhone(''); setEmail(''); setCreateLogin(false)
    setCredential('company_owner'); setTempPassword(''); setError(null)
  }, [isOpen])

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return }
    if (createLogin && !email.trim()) { setError('Email is required when creating a login.'); return }
    if (createLogin && tempPassword.length < 8) { setError('Temporary password must be at least 8 characters.'); return }
    setSubmitting(true)
    setError(null)

    const fullName = `${firstName.trim()} ${lastName.trim()}`
    let staffId: string | null = null

    if (officerRole === 'member_owner') {
      const res = await addMemberOwner(agencyId, {
        full_legal_name: fullName,
        email: email.trim() || undefined,
        telephone: phone.trim() || undefined,
        ownership_percentage: ownershipPct.trim() || undefined,
      })
      if (res.error) { setError(res.error); setSubmitting(false); return }
      staffId = (res.data as { id?: string } | null)?.id ?? null
    } else if (officerRole) {
      const res = await saveKeyStaffAdmin(agencyId, officerRole, {
        full_legal_name: fullName,
        telephone: phone.trim() || undefined,
        email: email.trim() || undefined,
      })
      if (res.error) { setError(res.error); setSubmitting(false); return }
      staffId = (res.data as { id?: string } | null)?.id ?? null
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Officer Role</label>
          <div className="relative">
            <select
              value={officerRole}
              onChange={e => setOfficerRole(e.target.value as OfficerRoleKey | '')}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none bg-white"
            >
              <option value="">— None (contact only) —</option>
              {OFFICER_ROLES.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {officerRole === 'member_owner' && (
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
  const [officerRole, setOfficerRole]   = useState(person.officerRole ?? '')
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
      setOfficerRole(person.officerRole ?? '')
      setCredential(person.credential ?? '')
      setError(null)
    }
  }, [isOpen, person])

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
        officer_role: officerRole || undefined,
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Officer Role</label>
              <div className="relative">
                <select
                  value={officerRole}
                  onChange={e => setOfficerRole(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                >
                  <option value="">— None —</option>
                  {OFFICER_ROLES.map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
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

function StatusToggle({
  row,
  toggling,
  onToggle,
}: {
  row: PersonRow
  toggling: boolean
  onToggle: () => void
}) {
  if (!row.credential) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Contact</span>
  }
  const isActive = row.status === 'active'
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={toggling}
      title={isActive ? 'Deactivate' : 'Activate'}
      className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50"
      style={{ backgroundColor: isActive ? '#2460d6' : '#d1d5db' }}
    >
      {toggling ? (
        <Loader2 className="w-3 h-3 animate-spin absolute left-0.5 text-white" />
      ) : (
        <span
          className="pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: isActive ? 'translateX(16px)' : 'translateX(0)' }}
        />
      )}
    </button>
  )
}

// ——— Main component ——————————————————————————————————————

export default function AgencyPeopleTab({ agencyId }: { agencyId: string }) {
  const [rows, setRows]         = useState<PersonRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Filters
  const [search, setSearch]     = useState('')
  const [roleFilter, setRoleFilter]           = useState('')
  const [credentialFilter, setCredentialFilter] = useState('')

  // Modal state
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
    setTogglingId(row.rowKey)
    if (row.adminRecordId) {
      await updateAgencyAdminStatus(agencyId, row.adminRecordId, next)
    } else if (row.coordinatorRecordId) {
      await updateCareCoordinatorStatus(agencyId, row.coordinatorRecordId, next)
    }
    setTogglingId(null)
    fetchData()
  }

  const filtered = rows.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      if (!r.fullName.toLowerCase().includes(q) && !(r.email ?? '').toLowerCase().includes(q)) return false
    }
    if (roleFilter === '__none__') {
      if (r.officerRole) return false
    } else if (roleFilter) {
      if (r.officerRole !== roleFilter) return false
    }
    if (credentialFilter === '__none__') {
      if (r.credential) return false
    } else if (credentialFilter) {
      if (r.credential !== credentialFilter) return false
    }
    return true
  })

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
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">{rows.length} {rows.length === 1 ? 'person' : 'people'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
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
            onChange={e => setRoleFilter(e.target.value)}
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
            onChange={e => setCredentialFilter(e.target.value)}
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
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400 italic">
            {rows.length === 0 ? 'No people associated with this agency yet.' : 'No people match the current filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Credential</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(row => {
                  const isInactive = row.status !== 'active'
                  return (
                    <tr key={row.rowKey} className={`hover:bg-gray-50/50 transition-colors ${isInactive ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{row.fullName || '—'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.officerRole
                          ? <span className="text-gray-700">{OFFICER_ROLE_LABEL[row.officerRole] ?? row.officerRole}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-600">{row.phone || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-600">{row.email || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3"><CredentialBadge credential={row.credential} /></td>
                      <td className="px-4 py-3">
                        <StatusToggle
                          row={row}
                          toggling={togglingId === row.rowKey}
                          onToggle={() => handleToggle(row)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditPerson(row)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {row.keyStaffId && !row.credential && (
                            <button
                              type="button"
                              onClick={() => setAccessPerson(row)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Give system access"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
