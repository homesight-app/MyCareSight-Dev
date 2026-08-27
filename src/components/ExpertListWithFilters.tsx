'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { fetchFilteredExpertsAction } from '@/app/actions/admin-list-filters'
import { Search, Mail, Phone, MapPin, Briefcase } from 'lucide-react'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'

interface Expert {
  id: string
  user_id: string
  first_name: string
  last_name: string
  email: string
  phone?: string
  status: string
  role: string
  expertise?: string
}

interface ExpertListWithFiltersProps {
  experts: Expert[]
  statesByExpert: Record<string, string[]>
  clientsByExpert: Record<string, number>
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export default function ExpertListWithFilters({
  experts,
  statesByExpert,
  clientsByExpert,
}: ExpertListWithFiltersProps) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const [selectedState, setSelectedState] = useState('All States')
  const [expertTab, setExpertTab] = useState<'active' | 'inactive'>('active')
  const [localExperts, setLocalExperts] = useState(experts)

  useEffect(() => { setLocalExperts(experts) }, [experts])

  // Only search + state trigger the server filter; tab is applied client-side
  // when no server filter is active, and passed along when it is.
  const hasServerFilter = useMemo(
    () => debouncedSearch.trim() !== '' || selectedState !== 'All States',
    [debouncedSearch, selectedState]
  )

  const [serverPayload, setServerPayload] = useState<Awaited<
    ReturnType<typeof fetchFilteredExpertsAction>
  >['data']>(null)
  const [filterLoading, setFilterLoading] = useState(false)

  useEffect(() => {
    if (!hasServerFilter) {
      setServerPayload(null)
      setFilterLoading(false)
      return
    }
    let cancelled = false
    setFilterLoading(true)
    fetchFilteredExpertsAction({
      search: debouncedSearch,
      selectedState,
      selectedStatus: expertTab === 'active' ? 'Active' : 'Inactive',
    }).then((res) => {
      if (cancelled) return
      setServerPayload(res.error ? null : res.data)
      setFilterLoading(false)
    })
    return () => { cancelled = true }
  }, [hasServerFilter, debouncedSearch, selectedState, expertTab])

  const tabFilteredExperts = useMemo(() => {
    const status = expertTab === 'active' ? 'active' : 'inactive'
    return localExperts.filter(e => e.status === status)
  }, [localExperts, expertTab])

  const inactiveCount = useMemo(
    () => localExperts.filter(e => e.status !== 'active').length,
    [localExperts]
  )

  const displayExperts = hasServerFilter
    ? ((serverPayload?.experts ?? []) as unknown as Expert[])
    : tabFilteredExperts
  const displayStatesByExpert = hasServerFilter ? serverPayload?.statesByExpert ?? {} : statesByExpert
  const displayClientsByExpert = hasServerFilter ? serverPayload?.clientsByExpert ?? {} : clientsByExpert

  const allStates = useMemo(() => {
    const statesSet = new Set<string>()
    Object.values(statesByExpert).forEach((states) => {
      states.forEach((state) => statesSet.add(state))
    })
    return Array.from(statesSet).sort()
  }, [statesByExpert])

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  }

  const handleTabChange = (tab: 'active' | 'inactive') => {
    setExpertTab(tab)
    setSearchInput('')
    setSelectedState('All States')
  }

  const handleToggleStatus = useCallback(async (expert: Expert) => {
    const isActive = expert.status === 'active'
    const actionText = isActive ? 'deactivate' : 'activate'

    if (!confirm(`Are you sure you want to ${actionText} ${expert.first_name} ${expert.last_name}?`)) {
      return
    }

    setLocalExperts((prev) => prev.filter((e) => e.id !== expert.id))

    try {
      const supabase = createClient()
      const newStatus = isActive ? 'inactive' : 'active'

      const { error } = await q.updateLicensingExpertById(supabase, expert.id, {
        status: newStatus,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        alert(`Failed to ${actionText} expert: ${error.message}`)
        router.refresh()
        return
      }

      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to ${actionText} expert: ${message}`)
    }
  }, [router])

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Active / Inactive tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('active')}
          aria-pressed={expertTab === 'active'}
          className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
            expertTab === 'active'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('inactive')}
          aria-pressed={expertTab === 'inactive'}
          className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
            expertTab === 'inactive'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
        <div className="flex flex-col gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
            <input
              type="text"
              placeholder="Search experts by name, email, or expertise..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 md:pl-10 pr-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="flex-1 min-w-[120px] px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="All States">All States</option>
              {allStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Row count */}
      {!filterLoading && (
        <p className="text-sm text-gray-500">
          Showing <span className="font-medium">{displayExperts.length}</span>{' '}
          {expertTab} expert{displayExperts.length !== 1 ? 's' : ''}
          {(searchInput || selectedState !== 'All States') ? ' matching filters' : ''}
        </p>
      )}

      {/* Expert cards */}
      <div className="space-y-4">
        {hasServerFilter && filterLoading ? (
          <div className="bg-white rounded-xl p-6 text-center text-gray-500 text-sm border border-gray-100 shadow-md">
            Searching…
          </div>
        ) : displayExperts && displayExperts.length > 0 ? (
          displayExperts.map((expert) => {
            const expertStatesList = displayStatesByExpert[expert.id] || []
            const clientCount = displayClientsByExpert[expert.id] || 0

            return (
              <div key={expert.id} className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm md:text-lg flex-shrink-0">
                      {getInitials(expert.first_name, expert.last_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                        <h3 className="text-lg md:text-xl font-bold text-gray-900 break-words">
                          {expert.first_name} {expert.last_name}
                        </h3>
                        <span
                          className={`px-2 md:px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
                            expert.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {expert.status}
                        </span>
                      </div>
                      <div className="text-sm md:text-base text-gray-600 mb-3">{expert.role}</div>
                      <div className="space-y-1 text-xs md:text-sm text-gray-600 mb-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                          <span className="break-all">{expert.email}</span>
                        </div>
                        {expert.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                            <span>{expert.phone}</span>
                          </div>
                        )}
                        {expertStatesList.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            <MapPin className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                            <span className="text-gray-700 font-medium">Specialization:</span>
                            {expertStatesList.map((state) => (
                              <span key={state} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                                {state}
                              </span>
                            ))}
                          </div>
                        )}
                        {expert.expertise && (
                          <div className="mt-2">
                            <span className="text-gray-700 font-medium">Expertise: </span>
                            <span className="text-gray-600 break-words">{expert.expertise}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Briefcase className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                          <span>{clientCount} Clients</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <RecordActionsMenu
                      label={`Actions for ${expert.first_name} ${expert.last_name}`}
                      actions={[
                        { label: 'View Profile', href: `/pages/admin/experts/${expert.id}` },
                        { label: 'Edit Information', href: `/pages/admin/experts/${expert.id}/edit` },
                        { label: 'Manage Clients', href: `/pages/admin/experts/${expert.id}/clients` },
                        { label: 'View Performance', href: `/pages/admin/experts/${expert.id}/performance` },
                        {
                          label: expert.status === 'active' ? 'Deactivate' : 'Activate',
                          onClick: () => handleToggleStatus(expert),
                          destructive: expert.status === 'active',
                          positive: expert.status !== 'active',
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="bg-white rounded-xl p-8 md:p-12 text-center shadow-md border border-gray-100">
            <Briefcase className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-base md:text-lg">No {expertTab} experts found</p>
            {(searchInput || selectedState !== 'All States') && (
              <p className="text-sm text-gray-400 mt-2">Try adjusting your search or filters</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
