'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Filter, MapPin, DollarSign, Clock, Calendar, Plus, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import AddLicenseTypeModal from './AddLicenseTypeModal'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import TablePagination from '@/components/ui/TablePagination'
import { useTableState } from '@/hooks/useTableState'
import { updateLicenseTypeActive } from '@/app/actions/license-types'

interface LicenseType {
  id: string
  state: string
  name: string
  description: string
  cost_display: string
  service_fee_display?: string
  processing_time_display: string
  processing_time_min?: number
  processing_time_max?: number
  renewal_period_display: string
  is_active: boolean
}

interface LicenseTypesTableProps {
  licenseTypes: LicenseType[]
}

type LicenseTabKey = 'active' | 'inactive'

export default function LicenseTypesTable({ licenseTypes }: LicenseTypesTableProps) {
  const router = useRouter()
  const [localLicenseTypes, setLocalLicenseTypes] = useState(licenseTypes)
  const [licenseTab, setLicenseTab] = useState<LicenseTabKey>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedState, setSelectedState] = useState('All States')
  const [showAddModal, setShowAddModal] = useState(false)

  const {
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    resetPage,
    applySortedData,
    applyPageSlice,
  } = useTableState({ defaultSort: { key: 'name', dir: 'asc' } })

  useEffect(() => {
    setLocalLicenseTypes(licenseTypes)
  }, [licenseTypes])

  const allStates = useMemo(() => {
    const statesSet = new Set<string>()
    localLicenseTypes.forEach(lt => { if (lt.state) statesSet.add(lt.state) })
    return Array.from(statesSet).sort()
  }, [localLicenseTypes])

  const inactiveCount = useMemo(
    () => localLicenseTypes.filter(lt => !lt.is_active).length,
    [localLicenseTypes]
  )

  const handleTabChange = (newTab: LicenseTabKey) => {
    if (newTab === licenseTab) return
    setLicenseTab(newTab)
    resetPage()
  }

  const sortFn = useCallback((key: string, dir: 'asc' | 'desc') => (a: LicenseType, b: LicenseType): number => {
    let aVal: string, bVal: string
    if (key === 'name') { aVal = a.name; bVal = b.name }
    else if (key === 'state') { aVal = a.state; bVal = b.state }
    else { return 0 }
    return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
  }, [])

  const filtered = useMemo(() => {
    return localLicenseTypes.filter(lt => {
      if (licenseTab === 'active' && !lt.is_active) return false
      if (licenseTab === 'inactive' && lt.is_active) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !lt.name.toLowerCase().includes(q) &&
          !lt.state.toLowerCase().includes(q) &&
          !(lt.description && lt.description.toLowerCase().includes(q))
        ) return false
      }

      if (selectedState !== 'All States' && lt.state !== selectedState) return false

      return true
    })
  }, [localLicenseTypes, licenseTab, searchQuery, selectedState])

  const sorted = useMemo(() => applySortedData(filtered, sortFn), [filtered, applySortedData, sortFn])
  const { slice: rows, totalCount } = useMemo(() => applyPageSlice(sorted), [sorted, applyPageSlice])

  const handleToggleActive = async (licenseType: LicenseType) => {
    const nextActive = !licenseType.is_active
    setLocalLicenseTypes(prev =>
      prev.map(lt => lt.id === licenseType.id ? { ...lt, is_active: nextActive } : lt)
    )
    const result = await updateLicenseTypeActive(licenseType.id, nextActive)
    if (result.error) {
      setLocalLicenseTypes(prev =>
        prev.map(lt => lt.id === licenseType.id ? { ...lt, is_active: licenseType.is_active } : lt)
      )
    } else {
      router.refresh()
    }
  }

  const getAverageProcessingTime = (lt: LicenseType) => {
    if (lt.processing_time_min && lt.processing_time_max) {
      return `${Math.round((lt.processing_time_min + lt.processing_time_max) / 2)} days`
    }
    return lt.processing_time_display || 'N/A'
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Active/Inactive tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg self-start">
            <button
              type="button"
              onClick={() => handleTabChange('active')}
              aria-pressed={licenseTab === 'active'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${licenseTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('inactive')}
              aria-pressed={licenseTab === 'inactive'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${licenseTab === 'inactive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
            </button>
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, state, or description…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
            />
          </div>
          <button className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center">
            <Filter className="w-4 h-4 text-gray-600" />
          </button>
          <select
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option>All States</option>
            {allStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Type
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No license types found</p>
            </div>
          ) : (
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="w-10 px-2 py-2.5" />
                  <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
                  <SortableColumnHeader label="State" sortKey="state" currentSort={sort} onSort={setSort} />
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Processing</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">App Fee</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Service Fee</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Renewal</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(lt => (
                  <tr key={lt.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="w-10 px-2 py-3">
                      <RecordActionsMenu
                        label={`Actions for ${lt.name}`}
                        actions={[
                          { label: 'View Details', href: `/pages/admin/license-requirements/${lt.id}` },
                          {
                            label: lt.is_active ? 'Deactivate' : 'Activate',
                            onClick: () => handleToggleActive(lt),
                            destructive: lt.is_active,
                            positive: !lt.is_active,
                          },
                        ]}
                      />
                    </td>
                    <td className={`px-4 py-3 ${!lt.is_active ? 'opacity-60' : ''}`}>
                      <div className="text-sm font-medium text-gray-900">{lt.name}</div>
                      {lt.description && (
                        <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{lt.description}</div>
                      )}
                      <div className="text-xs text-blue-500 mt-0.5">LIC-{lt.id.substring(0, 8).toUpperCase()}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm text-gray-700 ${!lt.is_active ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {lt.state}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm text-gray-700 ${!lt.is_active ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {getAverageProcessingTime(lt)}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm text-gray-700 ${!lt.is_active ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                        {lt.cost_display || 'N/A'}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm text-gray-700 ${!lt.is_active ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                        {lt.service_fee_display || 'N/A'}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm text-gray-700 ${!lt.is_active ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {lt.renewal_period_display || 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${lt.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {lt.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        entityLabel="license types"
      />

      <AddLicenseTypeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => { setShowAddModal(false); window.location.reload() }}
      />
    </div>
  )
}
