'use client'

import { useState, useMemo, useEffect } from 'react'
import ClientCardMenu from './ClientCardMenu'
import { fetchFilteredAgencyAdminsAction } from '@/app/actions/admin-list-filters'
import {
  Search,
  Filter,
  Mail,
  User,
  MapPin,
  Calendar,
  Building2,
} from 'lucide-react'

interface Client {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone?: string
  status: string
  start_date?: string
  expert_id?: string
}

interface Expert {
  user_id: string
  first_name: string
  last_name: string
}

interface ClientListWithFiltersProps {
  clients: Client[]
  expertsByUserId: Record<string, Expert>
  allExperts: Expert[]
  statesByClient: Record<string, string[]>
  casesByClient: Record<string, any[]>
  unreadMessagesByClient: Record<string, number>
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export default function ClientListWithFilters({
  clients,
  expertsByUserId,
  allExperts,
  statesByClient,
  casesByClient,
  unreadMessagesByClient,
}: ClientListWithFiltersProps) {
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const [selectedState, setSelectedState] = useState('All States')
  const [selectedStatus, setSelectedStatus] = useState('All Status')
  const [selectedExpert, setSelectedExpert] = useState('All Experts')

  const hasServerFilter = useMemo(
    () =>
      debouncedSearch.trim() !== '' ||
      selectedState !== 'All States' ||
      selectedStatus !== 'All Status' ||
      selectedExpert !== 'All Experts',
    [debouncedSearch, selectedState, selectedStatus, selectedExpert]
  )

  const [serverPayload, setServerPayload] = useState<Awaited<
    ReturnType<typeof fetchFilteredAgencyAdminsAction>
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
    fetchFilteredAgencyAdminsAction({
      search: debouncedSearch,
      selectedState,
      selectedStatus,
      selectedExpert,
    }).then((res) => {
      if (cancelled) return
      if (res.error) {
        setServerPayload(null)
      } else {
        setServerPayload(res.data)
      }
      setFilterLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [hasServerFilter, debouncedSearch, selectedState, selectedStatus, selectedExpert])

  const displayClients = hasServerFilter ? ((serverPayload?.clients ?? []) as unknown as Client[]) : clients
  const displayStatesByClient = hasServerFilter ? serverPayload?.statesByClient ?? {} : statesByClient
  const displayCasesByClient = hasServerFilter ? serverPayload?.casesByClient ?? {} : casesByClient
  const displayUnreadByClient = hasServerFilter ? serverPayload?.unreadMessagesByClient ?? {} : unreadMessagesByClient

  const expertLookup = useMemo(() => {
    if (!hasServerFilter || !serverPayload?.expertsByUserId) return expertsByUserId
    return { ...expertsByUserId, ...(serverPayload.expertsByUserId as unknown as Record<string, Expert>) }
  }, [hasServerFilter, serverPayload, expertsByUserId])

  const allStates = useMemo(() => {
    const statesSet = new Set<string>()
    Object.values(statesByClient).forEach((states) => {
      states.forEach((state) => statesSet.add(state))
    })
    return Array.from(statesSet).sort()
  }, [statesByClient])

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search Agency Admins by name,or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
            />
          </div>
          <button className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center">
            <Filter className="w-4 h-4 text-gray-600" />
          </button>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
          >
            <option>All States</option>
            {allStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
          >
            <option>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
            <option>Pending</option>
          </select>
          <select
            value={selectedExpert}
            onChange={(e) => setSelectedExpert(e.target.value)}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white cursor-pointer"
          >
            <option>All Experts</option>
            {allExperts.map((expert) => (
              <option key={expert.user_id} value={expert.user_id}>
                {expert.first_name} {expert.last_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {hasServerFilter && filterLoading ? (
          <div className="bg-white rounded-xl p-6 text-center text-gray-500 text-sm border border-gray-100 shadow-md">
            Searching…
          </div>
        ) : displayClients.length > 0 ? (
          displayClients.map((client) => {
              const expert = client.expert_id ? expertLookup[client.expert_id] : null
              const expertName = expert ? `${expert.first_name} ${expert.last_name}` : 'Unassigned'
              const clientStatesList = displayStatesByClient[client.id] || []
              const clientCases = displayCasesByClient[client.id] || []
              const avgProgress =
                clientCases.length > 0
                  ? Math.round(
                      clientCases.reduce((acc, c) => acc + ((c as { progress_percentage?: number }).progress_percentage || 0), 0) /
                        clientCases.length
                    )
                  : 0
              const unreadCount = displayUnreadByClient[client.id] || 0
              const statusCapitalized = client.status.charAt(0).toUpperCase() + client.status.slice(1)

              return (
                <div
                  key={client.id}
                  className="bg-white rounded-xl p-6 shadow-md border border-gray-100 relative block hover:shadow-lg transition-shadow"
                >
                  <div className="absolute top-6 right-6 z-10">
                    <ClientCardMenu clientId={client.id} client={client} />
                  </div>

                  <div className="flex items-start justify-between gap-4 pr-8">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                        {getInitials(client.contact_name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3 flex-wrap relative">
                          <h3 className="text-lg font-bold text-gray-900">{client.contact_name}</h3>
                          <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full whitespace-nowrap">
                            {statusCapitalized}
                          </span>
                          {unreadCount > 0 && (
                            <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full whitespace-nowrap">
                              {unreadCount} New Message{unreadCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        <div className="space-y-2 text-sm text-gray-600 mb-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span>Company: {client.company_name ? client.company_name : 'Unassigned'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 flex-shrink-0" />
                            <span className="break-all">{client.contact_email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 flex-shrink-0" />
                            <span>Expert: {expertName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 flex-shrink-0" />
                            <span>Started: {formatDate(client.start_date ?? null)}</span>
                          </div>
                        </div>

                        {clientStatesList.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap mb-4">
                            <span className="text-sm text-gray-600">States:</span>
                            {clientStatesList.map((state) => (
                              <span
                                key={state}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
                              >
                                <MapPin className="w-3 h-3" />
                                {state}
                              </span>
                            ))}
                          </div>
                        )}

                        {avgProgress > 0 && (
                          <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">Application Progress</span>
                              <span className="text-sm font-semibold text-gray-900">{avgProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div
                                className="bg-gray-800 h-2.5 rounded-full transition-all"
                                style={{ width: `${avgProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="bg-white rounded-xl p-8 md:p-12 text-center shadow-md border border-gray-100">
              <Building2 className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-base md:text-lg">No clients found</p>
            </div>
          )
        }
      </div>
    </>
  )
}
