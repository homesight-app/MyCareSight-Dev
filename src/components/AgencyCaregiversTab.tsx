'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { UserPlus, Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from './Modal'
import ResetPasswordModal from './ResetPasswordModal'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import TablePagination from '@/components/ui/TablePagination'
import { useTableState } from '@/hooks/useTableState'
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
    <div className="mb-4 p-4 border border-dashed border-blue-200 rounded-lg bg-blue-50/40">
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

type TabKey = 'active' | 'inactive'

export default function AgencyCaregiversTab({ agencyId }: { agencyId: string }) {
  const [tab, setTab] = useState<TabKey>('active')
  const [activeData, setActiveData] = useState<CaregiverRecord[]>([])
  const [inactiveData, setInactiveData] = useState<CaregiverRecord[] | null>(null)
  const [inactiveCount, setInactiveCount] = useState(0)
  const [inactiveLoaded, setInactiveLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingInactive, setLoadingInactive] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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

  const { search, setSearch, sort, setSort, page, setPage, pageSize, resetPage, applySortedData, applyPageSlice } = useTableState({
    defaultSort: { key: 'name', dir: 'asc' },
  })

  const fetchActive = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from('caregiver_members')
        .select('id, user_id, first_name, last_name, email, phone, role, job_title, status')
        .eq('agency_id', agencyId)
        .eq('status', 'active')
        .order('first_name'),
      supabase
        .from('caregiver_members')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .neq('status', 'active'),
    ])
    if (error) {
      setFetchError(error.message)
    } else {
      setActiveData((data ?? []) as CaregiverRecord[])
      setInactiveCount(count ?? 0)
    }
    setLoading(false)
  }, [agencyId])

  const fetchInactive = useCallback(async () => {
    setLoadingInactive(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('caregiver_members')
      .select('id, user_id, first_name, last_name, email, phone, role, job_title, status')
      .eq('agency_id', agencyId)
      .neq('status', 'active')
      .order('first_name')
    setInactiveData((data ?? []) as CaregiverRecord[])
    setInactiveLoaded(true)
    setLoadingInactive(false)
  }, [agencyId])

  useEffect(() => { fetchActive() }, [fetchActive])

  const handleTabChange = (newTab: TabKey) => {
    if (newTab === tab) return
    setTab(newTab)
    setSearch('')
    resetPage()
    if (newTab === 'inactive' && !inactiveLoaded) {
      fetchInactive()
    }
  }

  const currentData = tab === 'active' ? activeData : (inactiveData ?? [])

  const sortFn = useCallback((key: string, dir: 'asc' | 'desc') => (a: CaregiverRecord, b: CaregiverRecord): number => {
    let aVal: string, bVal: string
    if (key === 'name') {
      aVal = `${a.first_name} ${a.last_name}`
      bVal = `${b.first_name} ${b.last_name}`
    } else if (key === 'role') {
      aVal = a.job_title || a.role
      bVal = b.job_title || b.role
    } else {
      return 0
    }
    return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
  }, [])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return currentData
    return currentData.filter(cg =>
      `${cg.first_name} ${cg.last_name}`.toLowerCase().includes(term) ||
      cg.email.toLowerCase().includes(term) ||
      (cg.job_title || cg.role).toLowerCase().includes(term)
    )
  }, [currentData, search])

  const sorted = useMemo(() => applySortedData(filtered, sortFn), [filtered, applySortedData, sortFn])
  const { slice: rows, totalCount } = useMemo(() => applyPageSlice(sorted), [sorted, applyPageSlice])

  const handleToggle = async (cg: CaregiverRecord) => {
    setTogglingId(cg.id)
    await updateCaregiverStatus(agencyId, cg.id, cg.status === 'active' ? 'inactive' : 'active')
    setTogglingId(null)
    setInactiveData(null)
    setInactiveLoaded(false)
    if (tab === 'inactive') setLoadingInactive(true)
    fetchActive()
    if (tab === 'inactive') fetchInactive()
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
    fetchActive()
  }

  const openSettings = (cg: CaregiverRecord) => {
    setSettingsCg(cg)
    setEditFirst(cg.first_name)
    setEditLast(cg.last_name)
    setEditPhone(cg.phone ?? '')
    setEditJobTitle(cg.job_title ?? '')
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
    setInactiveData(null)
    setInactiveLoaded(false)
    fetchActive()
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
        <button type="button" onClick={fetchActive} className="text-red-600 hover:text-red-800 underline text-xs">Retry</button>
      </div>
    )
  }

  const isLoadingTabData = tab === 'inactive' && loadingInactive

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => handleTabChange('active')}
              aria-pressed={tab === 'active'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('inactive')}
              aria-pressed={tab === 'inactive'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${tab === 'inactive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
            </button>
          </div>
          <button
            type="button"
            onClick={fetchActive}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-3 sm:ml-auto">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search caregivers…"
            className="w-48 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            type="button"
            onClick={() => { setShowAdd(p => !p); setAddError(null) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Caregiver
          </button>
        </div>
      </div>

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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoadingTabData ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 italic text-center">
            {search ? 'No caregivers match your search.' : `No ${tab} caregivers found.`}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 px-2 py-2.5" />
                <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
                <SortableColumnHeader label="Role" sortKey="role" currentSort={sort} onSort={setSort} />
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(cg => (
                <tr key={cg.id} className={`hover:bg-gray-50/50 transition-colors ${cg.status !== 'active' ? 'opacity-60' : ''}`}>
                  <td className="w-10 px-2 py-3">
                    <RecordActionsMenu
                      label={`Actions for ${cg.first_name} ${cg.last_name}`}
                      actions={[
                        { label: 'Edit Caregiver', onClick: () => openSettings(cg) },
                        {
                          label: cg.status === 'active' ? 'Deactivate' : 'Activate',
                          onClick: () => handleToggle(cg),
                          destructive: cg.status === 'active',
                          hidden: togglingId === cg.id,
                        },
                      ]}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={`${cg.first_name} ${cg.last_name}`} email={cg.email} />
                      <span className="text-sm font-medium text-gray-900">{cg.first_name} {cg.last_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{cg.job_title || cg.role}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{cg.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{cg.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      cg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {cg.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        entityLabel="caregivers"
      />

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
