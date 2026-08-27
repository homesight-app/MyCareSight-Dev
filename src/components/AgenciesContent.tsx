'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import AddAgencyModal, { type AgencyAdminOption } from './AddAgencyModal'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import { setAgencyStatus } from '@/app/actions/agencies'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'

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
  primary_contact_first_name?: string | null
  primary_contact_last_name?: string | null
}

interface AgenciesContentProps {
  agencies: Agency[]
  agencyAdmins: AgencyAdminOption[]
  agencyAdminsForSelect: AgencyAdminOption[]
  detailBasePath?: string
  totalCount: number
  page: number
  pageSize: number
  initialSearch?: string
  initialStatus?: string
  initialSortKey?: string
  initialSortDir?: 'asc' | 'desc'
}

type SortKey = 'name' | 'created' | 'status'

export default function AgenciesContent({
  agencies,
  agencyAdmins,
  agencyAdminsForSelect,
  detailBasePath,
  totalCount,
  page,
  pageSize,
  initialSearch = '',
  initialStatus = 'active',
  initialSortKey = 'name',
  initialSortDir = 'asc',
}: AgenciesContentProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState(initialSearch)
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey as SortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir)
  const [localAgencies, setLocalAgencies] = useState(agencies)

  useEffect(() => { setLocalAgencies(agencies) }, [agencies])

  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize))
  const displayFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const displayTo   = Math.min((page + 1) * pageSize, totalCount)

  const pushParams = useCallback(
    (overrides: { page?: number; q?: string; status?: string; sortKey?: string; sortDir?: string }) => {
      const p = new URLSearchParams()
      const newPage    = overrides.page    ?? 0
      const newSearch  = overrides.q       !== undefined ? overrides.q    : search
      const newStatus  = overrides.status  !== undefined ? overrides.status  : statusFilter
      const newSortKey = overrides.sortKey !== undefined ? overrides.sortKey : sortKey
      const newSortDir = overrides.sortDir !== undefined ? overrides.sortDir : sortDir
      if (newPage    > 0)              p.set('page',    String(newPage))
      if (newSearch.trim())            p.set('q',       newSearch.trim())
      if (newStatus !== 'active')      p.set('status',  newStatus)
      if (newSortKey !== 'name')       p.set('sortKey', newSortKey)
      if (newSortDir !== 'asc')        p.set('sortDir', newSortDir)
      router.push(`?${p.toString()}`, { scroll: false })
    },
    [router, search, statusFilter, sortKey, sortDir]
  )

  // Debounced search — fires 400ms after user stops typing
  useEffect(() => {
    const id = setTimeout(() => {
      if (search !== initialSearch) {
        pushParams({ q: search, page: 0 })
      }
    }, 400)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    pushParams({ status: value, page: 0 })
  }

  function handleSort(key: SortKey) {
    const newDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc'
    setSortKey(key)
    setSortDir(newDir)
    pushParams({ sortKey: key, sortDir: newDir, page: 0 })
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

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

  const handleToggleStatus = async (agency: Agency) => {
    const next = (agency.status ?? 'active') === 'active' ? 'inactive' : 'active'
    if (statusFilter !== 'all') {
      setLocalAgencies((prev) => prev.filter((a) => a.id !== agency.id))
    }
    setTogglingId(agency.id)
    await setAgencyStatus(agency.id, next)
    setTogglingId(null)
    router.refresh()
  }

  const thCls = 'px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700'

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 sm:px-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900"></h2>
          {agencyAdminsForSelect.length >= 0 && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Add New Agency
            </button>
          )}
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
                onClick={() => handleStatusChange(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
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
              placeholder="Search by name…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 px-2" />
                <th scope="col" className={thCls} onClick={() => handleSort('name')}>
                  <span className="inline-flex items-center gap-1">Agency Name <SortIcon col="name" /></span>
                </th>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Primary Contact
                </th>
                <th scope="col" className={thCls} onClick={() => handleSort('created')}>
                  <span className="inline-flex items-center gap-1">Created <SortIcon col="created" /></span>
                </th>
                <th scope="col" className={thCls} onClick={() => handleSort('status')}>
                  <span className="inline-flex items-center gap-1">Status <SortIcon col="status" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {localAgencies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                    {search || statusFilter !== 'all'
                      ? 'No agencies match your search or filter.'
                      : 'No agencies yet. Click "Add New Agency" to create one.'}
                  </td>
                </tr>
              ) : (
                localAgencies.map((agency) => {
                  const isActive = (agency.status ?? 'active') === 'active'
                  const isToggling = togglingId === agency.id

                  return (
                    <tr
                      key={agency.id}
                      onClick={() => detailBasePath && router.push(`${detailBasePath}/${agency.id}`)}
                      className={`transition-colors ${detailBasePath ? 'cursor-pointer hover:bg-gray-50/50' : ''} ${!isActive ? 'opacity-60' : ''}`}
                    >
                      <td className="w-10 px-2 py-3" onClick={e => e.stopPropagation()}>
                        <RecordActionsMenu
                          label={`Actions for ${agency.name}`}
                          actions={[
                            ...(detailBasePath ? [{ label: 'View Details', icon: Eye, href: `${detailBasePath}/${agency.id}` }] : []),
                            {
                              label: isToggling ? '…' : isActive ? 'Deactivate' : 'Activate',
                              onClick: () => handleToggleStatus(agency),
                              destructive: isActive,
                              positive: !isActive,
                            },
                          ]}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {agency.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {[agency.primary_contact_first_name, agency.primary_contact_last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(agency.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {totalCount > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{displayFrom}–{displayTo}</span> of{' '}
              <span className="font-medium">{totalCount}</span> agencies
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => pushParams({ page: page - 1 })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => pushParams({ page: page + 1 })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AddAgencyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
        agencyAdmins={agencyAdmins}
        agencyAdminsForSelect={agencyAdminsForSelect}
        editAgency={null}
      />
    </>
  )
}
