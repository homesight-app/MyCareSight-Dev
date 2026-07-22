'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import AddAgencyModal, { type AgencyAdminOption } from './AddAgencyModal'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import { setAgencyStatus } from '@/app/actions/agencies'

interface Agency {
  id: string
  name: string
  agency_admin_ids: string[] | null
  created_at: string
  updated_at: string
  status?: string | null
  business_type?: string | null
  tax_id?: string | null
  primary_license_number?: string | null
  website?: string | null
  physical_street_address?: string | null
  physical_city?: string | null
  physical_state?: string | null
  physical_zip_code?: string | null
  same_as_physical?: boolean | null
  mailing_street_address?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip_code?: string | null
}

interface AgenciesContentProps {
  agencies: Agency[]
  agencyAdmins: AgencyAdminOption[]
  agencyAdminsForSelect: AgencyAdminOption[]
  detailBasePath?: string
}

type SortKey = 'name' | 'admin' | 'created' | 'status'

export default function AgenciesContent({
  agencies,
  agencyAdmins,
  agencyAdminsForSelect,
  detailBasePath,
}: AgenciesContentProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const closeModal = () => setModalOpen(false)

  const getAdminsDisplay = (agencyAdminIds: string[]) => {
    if (!agencyAdminIds?.length) return '—'
    const labels = agencyAdminIds
      .map((rawId) => {
        const id = String(rawId)
        const admin = agencyAdmins.find((a) => String(a.id) === id)
        if (!admin) return null
        const name = admin.contact_name?.trim()
        const email = admin.contact_email?.trim()
        return name || email || 'Agency admin'
      })
      .filter(Boolean) as string[]
    return labels.length ? labels.join(', ') : '—'
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return '—'
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = agencies.filter((a) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? (a.status ?? 'active') === 'active' : (a.status ?? 'active') === 'inactive')
      const matchesSearch =
        !term ||
        a.name.toLowerCase().includes(term) ||
        getAdminsDisplay(normalizeAgencyAdminIds(a.agency_admin_ids)).toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })

    return list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      if (sortKey === 'admin') {
        const aA = getAdminsDisplay(normalizeAgencyAdminIds(a.agency_admin_ids))
        const bA = getAdminsDisplay(normalizeAgencyAdminIds(b.agency_admin_ids))
        cmp = aA.localeCompare(bA)
      }
      if (sortKey === 'created') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortKey === 'status') {
        const aS = (a.status ?? 'active') === 'active' ? 0 : 1
        const bS = (b.status ?? 'active') === 'active' ? 0 : 1
        cmp = aS - bS
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencies, search, statusFilter, sortKey, sortDir])

  const counts = useMemo(() => ({
    active: agencies.filter(a => (a.status ?? 'active') === 'active').length,
    inactive: agencies.filter(a => (a.status ?? 'active') === 'inactive').length,
    all: agencies.length,
  }), [agencies])

  const handleToggleStatus = async (e: React.ChangeEvent<HTMLInputElement>, agency: Agency) => {
    e.stopPropagation()
    const next = (agency.status ?? 'active') === 'active' ? 'inactive' : 'active'
    setTogglingId(agency.id)
    await setAgencyStatus(agency.id, next)
    setTogglingId(null)
    router.refresh()
  }

  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900'

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 sm:px-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900"></h2>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Add New Agency
          </button>
        </div>

        {/* Search + Filter toolbar */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {([
              { key: 'active', label: 'Active' },
              { key: 'inactive', label: 'Inactive' },
              { key: 'all', label: 'All' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
                <span className={`ml-1.5 text-xs ${statusFilter === key ? 'text-blue-600' : 'text-gray-400'}`}>
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or admin…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className={thCls} onClick={() => handleSort('name')}>
                  <span className="inline-flex items-center gap-1">Agency Name <SortIcon col="name" /></span>
                </th>
                <th scope="col" className={thCls} onClick={() => handleSort('admin')}>
                  <span className="inline-flex items-center gap-1">Agency Admin <SortIcon col="admin" /></span>
                </th>
                <th scope="col" className={thCls} onClick={() => handleSort('created')}>
                  <span className="inline-flex items-center gap-1">Created <SortIcon col="created" /></span>
                </th>
                <th scope="col" className={thCls} onClick={() => handleSort('status')}>
                  <span className="inline-flex items-center gap-1">Status <SortIcon col="status" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                    {search || statusFilter !== 'all'
                      ? 'No agencies match your search or filter.'
                      : 'No agencies yet. Click "Add New Agency" to create one.'}
                  </td>
                </tr>
              ) : (
                filtered.map((agency) => {
                  const isActive = (agency.status ?? 'active') === 'active'
                  const isToggling = togglingId === agency.id

                  return (
                    <tr
                      key={agency.id}
                      onClick={() => detailBasePath && router.push(`${detailBasePath}/${agency.id}`)}
                      className={`transition-colors ${detailBasePath ? 'cursor-pointer hover:bg-gray-50' : ''} ${!isActive ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {agency.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {getAdminsDisplay(normalizeAgencyAdminIds(agency.agency_admin_ids))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(agency.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <label className={`relative inline-flex items-center gap-3 ${isToggling ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={(e) => handleToggleStatus(e, agency)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                          <span className="text-sm font-medium text-gray-700">
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </label>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddAgencyModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSuccess={closeModal}
        agencyAdmins={agencyAdmins}
        agencyAdminsForSelect={agencyAdminsForSelect}
        editAgency={null}
      />
    </>
  )
}
