'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, UserPlus, X, Loader2, Mail, Phone, RefreshCw, ChevronDown, Shield, Stethoscope, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { addAdminToAgency, removeAdminFromAgency } from '@/app/actions/agencies'
import { updateCaregiverStatus, updateCareCoordinatorStatus } from '@/app/actions/agency-users'

// ——— Types ———————————————————————————————————————————

interface AdminRecord {
  id: string
  contact_name: string | null
  contact_email: string | null
  status: string | null
}

interface CoordinatorRecord {
  id: string
  first_name: string
  last_name: string
  email: string
  status: string
}

interface CaregiverRecord {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  role: string
  job_title: string | null
  status: string
}

interface UserData {
  admins: AdminRecord[]
  availableAdmins: AdminRecord[]
  coordinators: CoordinatorRecord[]
  caregivers: CaregiverRecord[]
}

interface AgencyUsersTabProps {
  agencyId: string
}

// ——— Helpers ———————————————————————————————————————————

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

function Avatar({ name, email, color = 'purple' }: { name?: string | null; email?: string; color?: string }) {
  const initial = (name || email || '?')[0].toUpperCase()
  const colors: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    teal: 'bg-teal-100 text-teal-700',
  }
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm ${colors[color] ?? colors.purple}`}>
      {initial}
    </div>
  )
}

// ——— Section wrapper ———————————————————————————————————

function Section({ title, icon: Icon, count, children }: {
  title: string
  icon: React.ElementType
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="w-full px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4.5 h-4.5 text-purple-600 w-5 h-5" />
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full">{count}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  )
}

// ——— Agency Admins section ———————————————————————————————

function AdminsSection({ agencyId, admins, available, onRefresh }: {
  agencyId: string
  admins: AdminRecord[]
  available: AdminRecord[]
  onRefresh: () => void
}) {
  const [selectedId, setSelectedId] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!selectedId) return
    setAdding(true)
    setAddError(null)
    const result = await addAdminToAgency(agencyId, selectedId)
    setAdding(false)
    if (result.error) { setAddError(result.error); return }
    setSelectedId('')
    onRefresh()
  }

  const handleRemove = async (adminId: string) => {
    setRemovingId(adminId)
    await removeAdminFromAgency(agencyId, adminId)
    setRemovingId(null)
    onRefresh()
  }

  return (
    <Section title="Agency Admins" icon={Shield} count={admins.length}>
      {admins.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400 italic">No admins assigned.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {admins.map(admin => (
            <div key={admin.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={admin.contact_name} email={admin.contact_email ?? undefined} color="purple" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{admin.contact_name || 'Unnamed Admin'}</p>
                  {admin.contact_email && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      {admin.contact_email}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {admin.status && <StatusBadge status={admin.status} />}
                <button
                  type="button"
                  onClick={() => handleRemove(admin.id)}
                  disabled={removingId === admin.id}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Remove from agency"
                >
                  {removingId === admin.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row gap-2">
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setAddError(null) }}
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
          >
            <option value="">Add existing admin to this agency…</option>
            {available.map(a => (
              <option key={a.id} value={a.id}>{a.contact_name || a.contact_email || a.id}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedId || adding}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>
      )}
      {addError && <p className="px-5 py-2 text-xs text-red-600">{addError}</p>}
    </Section>
  )
}

// ——— Care Coordinators section ——————————————————————————

function CoordinatorsSection({ agencyId, coordinators, onRefresh }: {
  agencyId: string
  coordinators: CoordinatorRecord[]
  onRefresh: () => void
}) {
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const displayed = coordinators.filter(c => filter === 'all' || c.status === filter)

  const toggleStatus = async (c: CoordinatorRecord) => {
    const next = c.status === 'active' ? 'inactive' : 'active'
    setTogglingId(c.id)
    await updateCareCoordinatorStatus(agencyId, c.id, next)
    setTogglingId(null)
    onRefresh()
  }

  return (
    <Section title="Care Coordinators" icon={User} count={coordinators.filter(c => c.status === 'active').length}>
      <div className="px-5 py-2 flex gap-2 border-b border-gray-50">
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${filter === f ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {displayed.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400 italic">No care coordinators found.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {displayed.map(coord => (
            <div key={coord.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={`${coord.first_name} ${coord.last_name}`} email={coord.email} color="blue" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{coord.first_name} {coord.last_name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    {coord.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={coord.status} />
                <button
                  type="button"
                  onClick={() => toggleStatus(coord)}
                  disabled={togglingId === coord.id}
                  className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {togglingId === coord.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : coord.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ——— Caregivers section —————————————————————————————————

function CaregiversSection({ agencyId, caregivers, onRefresh }: {
  agencyId: string
  caregivers: CaregiverRecord[]
  onRefresh: () => void
}) {
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [search, setSearch] = useState('')

  const displayed = caregivers.filter(c => {
    const matchesFilter = filter === 'all' || c.status === filter
    const term = search.toLowerCase()
    const matchesSearch = !term ||
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      c.role.toLowerCase().includes(term)
    return matchesFilter && matchesSearch
  })

  const toggleStatus = async (c: CaregiverRecord) => {
    const next = c.status === 'active' ? 'inactive' : 'active'
    setTogglingId(c.id)
    await updateCaregiverStatus(agencyId, c.id, next)
    setTogglingId(null)
    onRefresh()
  }

  return (
    <Section title="Caregivers" icon={Stethoscope} count={caregivers.filter(c => c.status === 'active').length}>
      <div className="px-5 py-2 flex flex-col sm:flex-row sm:items-center gap-2 border-b border-gray-50">
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${filter === f ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
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
          className="sm:ml-auto flex-1 sm:max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
        />
      </div>

      {displayed.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400 italic">
          {search ? 'No caregivers match your search.' : 'No caregivers found.'}
        </p>
      ) : (
        <div className="divide-y divide-gray-50">
          {displayed.map(cg => (
            <div key={cg.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={`${cg.first_name} ${cg.last_name}`} email={cg.email} color="teal" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {cg.first_name} {cg.last_name}
                  </p>
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
                  onClick={() => toggleStatus(cg)}
                  disabled={togglingId === cg.id}
                  className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {togglingId === cg.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : cg.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ——— Main component ——————————————————————————————————————

export default function AgencyUsersTab({ agencyId }: AgencyUsersTabProps) {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()

    const [adminsRes, availableRes, coordsRes, caregiversRes] = await Promise.all([
      supabase
        .from('agency_admins')
        .select('id, contact_name, contact_email, status')
        .eq('agency_id', agencyId)
        .order('contact_name', { ascending: true }),
      supabase
        .from('agency_admins')
        .select('id, contact_name, contact_email')
        .is('agency_id', null)
        .not('user_id', 'is', null)
        .order('contact_name', { ascending: true }),
      supabase
        .from('care_coordinators')
        .select('id, first_name, last_name, email, status')
        .eq('agency_id', agencyId)
        .order('first_name', { ascending: true }),
      supabase
        .from('caregiver_members')
        .select('id, first_name, last_name, email, phone, role, job_title, status')
        .eq('agency_id', agencyId)
        .order('first_name', { ascending: true }),
    ])

    const err = adminsRes.error || coordsRes.error || caregiversRes.error
    if (err) {
      setFetchError(err.message)
    } else {
      setUserData({
        admins: (adminsRes.data ?? []) as AdminRecord[],
        availableAdmins: (availableRes.data ?? []) as AdminRecord[],
        coordinators: (coordsRes.data ?? []) as CoordinatorRecord[],
        caregivers: (caregiversRes.data ?? []) as CaregiverRecord[],
      })
    }
    setLoading(false)
  }, [agencyId])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm flex items-center justify-between gap-3">
        <span>Failed to load users: {fetchError}</span>
        <button type="button" onClick={fetchData} className="text-red-600 hover:text-red-800 underline text-xs">Retry</button>
      </div>
    )
  }

  if (!userData) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">
            {userData.admins.length + userData.coordinators.length + userData.caregivers.length} total users
          </span>
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

      <AdminsSection
        agencyId={agencyId}
        admins={userData.admins}
        available={userData.availableAdmins}
        onRefresh={fetchData}
      />

      <CoordinatorsSection
        agencyId={agencyId}
        coordinators={userData.coordinators}
        onRefresh={fetchData}
      />

      <CaregiversSection
        agencyId={agencyId}
        caregivers={userData.caregivers}
        onRefresh={fetchData}
      />
    </div>
  )
}
