'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Users, CheckCircle2, FileText, Plus, Search, Eye, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import LoadingSpinner from '@/components/LoadingSpinner'
import AddNewClientModal from './AddNewClientModal'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { mapInsertedPatientToListPatient, type ClientsListPatient } from '@/lib/map-inserted-patient-to-list-row'
import { patientFullName } from '@/lib/patient-name'

interface ClientsContentProps {
  clients: ClientsListPatient[]
  totalCount: number
  activeCount: number
  totalAllCount: number
  page: number
  pageSize: number
  search: string
  statusFilter: string
}

export default function ClientsContent({
  clients: initialClients,
  totalCount,
  activeCount,
  totalAllCount,
  page,
  pageSize,
  search: initialSearch,
  statusFilter: initialStatusFilter,
}: ClientsContentProps) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter)
  const [clients, setClients] = useState<ClientsListPatient[]>(initialClients)
  const [navigatingClientId, setNavigatingClientId] = useState<string | null>(null)
  const [, startNavigationTransition] = useTransition()
  const [portalMounted, setPortalMounted] = useState(false)

  useEffect(() => { setPortalMounted(true) }, [])

  // Merge optimistic additions with server data (preserves newly added rows until server confirms)
  useEffect(() => {
    setClients((prev) => {
      const serverIds = new Set(initialClients.map((c) => c.id))
      const pendingOnlyOnClient = prev.filter((p) => !serverIds.has(p.id))
      return [...pendingOnlyOnClient, ...initialClients]
    })
  }, [initialClients])

  // Sync filter state when URL params change (e.g. browser back/forward)
  useEffect(() => { setSearchQuery(initialSearch) }, [initialSearch])
  useEffect(() => { setStatusFilter(initialStatusFilter) }, [initialStatusFilter])

  const pushParams = useCallback(
    (overrides: { page?: number; q?: string; status?: string }) => {
      const p = new URLSearchParams()
      const newPage   = overrides.page   ?? 0
      const newSearch = overrides.q      ?? searchQuery
      const newStatus = overrides.status ?? statusFilter
      if (newPage   > 0)      p.set('page',   String(newPage))
      if (newSearch.trim())   p.set('q',      newSearch.trim())
      if (newStatus !== 'all') p.set('status', newStatus)
      const qs = p.toString()
      router.push(`?${qs}`, { scroll: false })
    },
    [router, searchQuery, statusFilter]
  )

  // Debounced search — fires 400 ms after the user stops typing
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchQuery !== initialSearch) {
        pushParams({ q: searchQuery, page: 0 })
      }
    }, 400)
    return () => clearTimeout(id)
  }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    pushParams({ status: value, page: 0 })
  }

  const handleOpenClientDetails = (clientId: string) => {
    if (navigatingClientId) return
    setNavigatingClientId(clientId)
    const safetyMs = 25_000
    setTimeout(() => {
      setNavigatingClientId((cur) => (cur === clientId ? null : cur))
    }, safetyMs)
    startNavigationTransition(() => {
      router.push(`/pages/agency/clients/${clientId}`)
    })
  }

  const toggleStatus = async (clientId: string, currentStatus: 'active' | 'inactive') => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, status: newStatus } : c)))
    try {
      const supabase = createClient()
      const { error } = await q.updatePatientStatus(supabase, clientId, newStatus)
      if (error) {
        setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, status: currentStatus } : c)))
        console.error('Error updating status:', error)
      }
    } catch (error) {
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, status: currentStatus } : c)))
      console.error('Error updating status:', error)
    }
  }

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  // Pagination math
  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize))
  const displayFrom = totalCount === 0 ? 0 : page * pageSize + 1
  const displayTo   = Math.min((page + 1) * pageSize, totalCount)

  return (
    <div className="space-y-6">
      {portalMounted && navigatingClientId && createPortal(
        <div aria-busy="true" aria-live="polite">
          <LoadingSpinner overlayZClass="z-[200]" />
        </div>,
        document.body
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-blue-600" />
            Client Management
          </h1>
          <p className="text-sm text-gray-600 mt-1">Manage your clients and their care plans</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add New Client
        </button>
      </div>

      {/* Summary Cards — always show counts for all clients, not just the current page */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalAllCount}</div>
              <div className="text-sm text-gray-600">Total Clients</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{activeCount}</div>
              <div className="text-sm text-gray-600">Active Clients</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">0</div>
              <div className="text-sm text-gray-600">Care Plans Created</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search clients by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">CLIENT</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">GENDER</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">CLASS</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">PATIENT PHONE</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">EMERGENCY CONTACT</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">REPRESENTATIVE #1</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">REPRESENTATIVE #2</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">STATUS</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clients.length > 0 ? (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className={`hover:bg-gray-50 cursor-pointer ${navigatingClientId ? 'opacity-70 pointer-events-none' : ''}`}
                    onClick={() => handleOpenClientDetails(client.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                          {getInitials(patientFullName(client))}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{patientFullName(client)}</div>
                          <div className="text-sm text-gray-500">Age {client.age || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.gender || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.class ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">{client.class}</span>
                      ) : (
                        <span className="text-sm text-gray-500">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {client.phone_number?.trim() ? client.phone_number : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {client.emergency_contact_name?.trim() ? (
                        <div>
                          <div>{client.emergency_contact_name}</div>
                          <div className="text-xs text-gray-500">{client.emergency_phone?.trim() || 'No phone'}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {client.patients_representatives.length > 0 ? (
                        <div>
                          <div>{client.patients_representatives[0].name}</div>
                          <div className="text-xs text-gray-500">
                            {client.patients_representatives[0].relationship}{' '}
                            {client.patients_representatives[0].phone_number && `(${client.patients_representatives[0].phone_number})`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {client.patients_representatives.length > 1 ? (
                        <div>
                          <div>{client.patients_representatives[1].name}</div>
                          <div className="text-xs text-gray-500">
                            {client.patients_representatives[1].relationship}{' '}
                            {client.patients_representatives[1].phone_number && `(${client.patients_representatives[1].phone_number})`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={client.status === 'active'}
                          onChange={() => toggleStatus(client.id, client.status)}
                          onClick={(e) => e.stopPropagation()}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        <span className="ml-3 text-sm font-medium text-gray-700">
                          {client.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </label>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenClientDetails(client.id)}
                        disabled={navigatingClientId !== null}
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {navigatingClientId === client.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Loading...</>
                        ) : (
                          <><Eye className="w-4 h-4" />View Details</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No clients found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {totalCount > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{displayFrom}–{displayTo}</span> of{' '}
              <span className="font-medium">{totalCount}</span> clients
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
              <span className="text-sm text-gray-600">
                Page {page + 1} of {totalPages}
              </span>
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

      {/* Add New Client Modal */}
      <AddNewClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(insertedRow) => {
          if (!insertedRow) return
          const next = mapInsertedPatientToListPatient(insertedRow)
          setClients((prev) => [next, ...prev.filter((c) => c.id !== next.id)])
        }}
      />
    </div>
  )
}
