'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Stethoscope, UserPlus, Loader2, Mail, Phone, RefreshCw,
  ChevronDown, UserX, UserCheck, Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from './Modal'
import ResetPasswordModal from './ResetPasswordModal'
import {
  updateCaregiverStatus,
  addCaregiverForAgency,
  updateCaregiverProfile,
} from '@/app/actions/agency-users'

interface CaregiverRecord {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  email: string
  phone: string | null
  role: string
  job_title: string | null
  status: string
}

// ——— Shared helpers ———————————————————————————————————————

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  suspended: 'bg-red-100 text-red-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function Avatar({ name, email }: { name?: string | null; email?: string }) {
  const initial = (name || email || '?')[0].toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm bg-teal-100 text-teal-700">
      {initial}
    </div>
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

function AddPanel({ children, onSave, onCancel, submitting, error }: {
  children: React.ReactNode
  onSave: () => void
  onCancel: () => void
  submitting: boolean
  error: string | null
}) {
  return (
    <div className="mx-5 mb-4 mt-2 p-4 border border-dashed border-blue-200 rounded-lg bg-blue-50/40">
      <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Add New Caregiver</h4>
      <div className="space-y-3">{children}</div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {submitting ? 'Creating…' : 'Create Account'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function UserSettingsModal({
  isOpen, onClose, userId, name, email, children, onSave, saving, saveError,
}: {
  isOpen: boolean
  onClose: () => void
  userId: string | null
  name: string
  email: string
  children: React.ReactNode
  onSave: () => void
  saving: boolean
  saveError: string | null
}) {
  const [passwordOpen, setPasswordOpen] = useState(false)
  const handleClose = () => { setPasswordOpen(false); onClose() }
  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Caregiver Settings" size="md">
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Edit Profile</h3>
            <div className="space-y-3">{children}</div>
            {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
          <div className="border-t border-gray-200" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Password</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {userId ? 'Set a new password for this user.' : 'No system account linked.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => userId && setPasswordOpen(true)}
              disabled={!userId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Change Password
            </button>
          </div>
        </div>
      </Modal>
      {userId && (
        <ResetPasswordModal
          isOpen={passwordOpen}
          onClose={() => setPasswordOpen(false)}
          userName={name}
          userEmail={email}
          userId={userId}
        />
      )}
    </>
  )
}

// ——— Main component ——————————————————————————————————————

export default function AgencyCaregiversTab({ agencyId }: { agencyId: string }) {
  const [caregivers, setCaregivers] = useState<CaregiverRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [search, setSearch] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', email: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [settingsCg, setSettingsCg] = useState<CaregiverRecord | null>(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editJobTitle, setEditJobTitle] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('caregiver_members')
      .select('id, user_id, first_name, last_name, email, phone, role, job_title, status')
      .eq('agency_id', agencyId)
      .order('first_name', { ascending: true })
    if (error) {
      setFetchError(error.message)
    } else {
      setCaregivers((data ?? []) as CaregiverRecord[])
    }
    setLoading(false)
  }, [agencyId])

  useEffect(() => { fetchData() }, [fetchData])

  const displayed = caregivers.filter(c => {
    const matchesFilter = filter === 'all' || c.status === filter
    const term = search.toLowerCase()
    const matchesSearch = !term ||
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      c.role.toLowerCase().includes(term)
    return matchesFilter && matchesSearch
  })

  const handleToggle = async (c: CaregiverRecord) => {
    setTogglingId(c.id)
    await updateCaregiverStatus(agencyId, c.id, c.status === 'active' ? 'inactive' : 'active')
    setTogglingId(null)
    fetchData()
  }

  const handleAdd = async () => {
    if (!addForm.firstName.trim() || !addForm.lastName.trim() || !addForm.email.trim()) {
      setAddError('All fields are required.')
      return
    }
    setAdding(true)
    setAddError(null)
    const result = await addCaregiverForAgency(agencyId, {
      firstName: addForm.firstName.trim(),
      lastName: addForm.lastName.trim(),
      email: addForm.email.trim(),
    })
    setAdding(false)
    if (result.error) { setAddError(result.error); return }
    setShowAdd(false)
    setAddForm({ firstName: '', lastName: '', email: '' })
    fetchData()
  }

  const openSettings = (c: CaregiverRecord) => {
    setSettingsCg(c)
    setEditFirst(c.first_name)
    setEditLast(c.last_name)
    setEditPhone(c.phone ?? '')
    setEditJobTitle(c.job_title ?? '')
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!settingsCg) return
    if (!editFirst.trim() || !editLast.trim()) { setEditError('First and last name are required.'); return }
    setSavingEdit(true)
    setEditError(null)
    const result = await updateCaregiverProfile(agencyId, settingsCg.id, {
      first_name: editFirst.trim(),
      last_name: editLast.trim(),
      phone: editPhone.trim() || undefined,
      job_title: editJobTitle.trim() || undefined,
    })
    setSavingEdit(false)
    if (result.error) { setEditError(result.error); return }
    setSettingsCg(null)
    fetchData()
  }

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
        <span>Failed to load caregivers: {fetchError}</span>
        <button type="button" onClick={fetchData} className="text-red-600 hover:text-red-800 underline text-xs">Retry</button>
      </div>
    )
  }

  const activeCount = caregivers.filter(c => c.status === 'active').length

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">{caregivers.length} total caregivers</span>
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="w-full px-5 py-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen(p => !p)}
            className="flex items-center gap-2.5 flex-1 min-w-0"
          >
            <Stethoscope className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900">Caregivers</span>
            <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full">{activeCount}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => { setShowAdd(p => !p); setAddError(null) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors flex-shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Caregiver
          </button>
        </div>

        {open && (
          <div className="border-t border-gray-100">
            {showAdd && (
              <AddPanel
                onSave={handleAdd}
                onCancel={() => { setShowAdd(false); setAddError(null) }}
                submitting={adding}
                error={addError}
              >
                <div className="grid grid-cols-2 gap-3">
                  <FieldInput label="First Name" value={addForm.firstName} onChange={v => setAddForm(p => ({ ...p, firstName: v }))} required />
                  <FieldInput label="Last Name" value={addForm.lastName} onChange={v => setAddForm(p => ({ ...p, lastName: v }))} required />
                </div>
                <FieldInput label="Email" type="email" value={addForm.email} onChange={v => setAddForm(p => ({ ...p, email: v }))} required />
              </AddPanel>
            )}

            <div className="px-5 py-2 flex flex-col sm:flex-row sm:items-center gap-2 border-b border-gray-50">
              <div className="flex gap-2">
                {(['all', 'active', 'inactive'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${filter === f ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    {f === 'all' ? `All (${caregivers.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${caregivers.filter(c => c.status === f).length})`}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, or role…"
                className="sm:ml-auto flex-1 sm:max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {displayed.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400 italic">
                {search ? 'No caregivers match your search.' : 'No caregivers found.'}
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {displayed.map(cg => {
                  const isActive = cg.status === 'active'
                  return (
                    <div key={cg.id} className={`px-5 py-3 flex items-center justify-between gap-3 ${!isActive ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={`${cg.first_name} ${cg.last_name}`} email={cg.email} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{cg.first_name} {cg.last_name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              {cg.email}
                            </p>
                            {cg.phone && (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Phone className="w-3 h-3 flex-shrink-0" />
                                {cg.phone}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{cg.job_title || cg.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={cg.status} />
                        <button
                          type="button"
                          onClick={() => handleToggle(cg)}
                          disabled={togglingId === cg.id}
                          className={`${isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'} disabled:opacity-50 transition-colors`}
                          title={isActive ? 'Disable' : 'Enable'}
                        >
                          {togglingId === cg.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openSettings(cg)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Settings"
                        >
                          <Settings className="w-4 h-4" />
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

      <UserSettingsModal
        isOpen={!!settingsCg}
        onClose={() => { setSettingsCg(null); setEditError(null) }}
        userId={settingsCg?.user_id ?? null}
        name={settingsCg ? `${settingsCg.first_name} ${settingsCg.last_name}` : ''}
        email={settingsCg?.email ?? ''}
        onSave={handleSaveEdit}
        saving={savingEdit}
        saveError={editError}
      >
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="First Name" value={editFirst} onChange={setEditFirst} required />
          <FieldInput label="Last Name" value={editLast} onChange={setEditLast} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Phone (optional)" value={editPhone} onChange={setEditPhone} placeholder="e.g. 555-123-4567" />
          <FieldInput label="Job Title (optional)" value={editJobTitle} onChange={setEditJobTitle} placeholder="e.g. CNA" />
        </div>
      </UserSettingsModal>
    </>
  )
}
