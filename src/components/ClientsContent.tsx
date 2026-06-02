'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Users, CheckCircle2, FileText, Plus, Search, Eye, Loader2 } from 'lucide-react'
import LoadingSpinner from '@/components/LoadingSpinner'
import AddNewClientModal from './AddNewClientModal'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { mapInsertedPatientToListPatient, type ClientsListPatient } from '@/lib/map-inserted-patient-to-list-row'
import { patientFullName } from '@/lib/patient-name'

interface ClientsContentProps {
  clients: ClientsListPatient[]
}

export default function ClientsContent({ clients: initialClients }: ClientsContentProps) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All Status' | 'active' | 'inactive'>('All Status')
  const [clients, setClients] = useState<ClientsListPatient[]>(initialClients)
  const [navigatingClientId, setNavigatingClientId] = useState<string | null>(null)
  const [, startNavigationTransition] = useTransition()
  const [portalMounted, setPortalMounted] = useState(false)

  useEffect(() => {
    setPortalMounted(true)
  }, [])

  useEffect(() => {
    setClients((prev) => {
      const serverIds = new Set(initialClients.map((c) => c.id))
      const pendingOnlyOnClient = prev.filter((p) => !serverIds.has(p.id))
      return [...pendingOnlyOnClient, ...initialClients]
    })
  }, [initialClients])

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

  // Calculate statistics
  const totalClients = clients.length
  const activeClients = clients.filter(c => c.status === 'active').length
  const carePlansCreated = 0 // This would come from a care_plans table if it exists

  // Filter clients
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch = 
          patientFullName(client).toLowerCase().includes(query) ||
          client.email_address.toLowerCase().includes(query) ||
          client.phone_number.includes(query) ||
          (client.emergency_contact_name ?? '').toLowerCase().includes(query) ||
          (client.emergency_phone ?? '').includes(query)
        if (!matchesSearch) return false
      }

      // Status filter
      if (statusFilter !== 'All Status' && client.status !== statusFilter) {
        return false
      }

      return true
    })
  }, [clients, searchQuery, statusFilter])

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const toggleStatus = async (clientId: string, currentStatus: 'active' | 'inactive') => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    
    // Optimistic update
    setClients(prevClients =>
      prevClients.map(client =>
        client.id === clientId ? { ...client, status: newStatus } : client
      )
    )

    try {
      const supabase = createClient()
      const { error } = await q.updatePatientStatus(supabase, clientId, newStatus)

      if (error) {
        // Revert on error
        setClients(prevClients =>
          prevClients.map(client =>
            client.id === clientId ? { ...client, status: currentStatus } : client
          )
        )
        console.error('Error updating status:', error)
      }
    } catch (error) {
      // Revert on error
      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId ? { ...client, status: currentStatus } : client
        )
      )
      console.error('Error updating status:', error)
    }
  }

  return (
    <div className="space-y-6">
      {portalMounted &&
        navigatingClientId &&
        createPortal(
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalClients}</div>
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
              <div className="text-2xl font-bold text-gray-900">{activeClients}</div>
              <div className="text-sm text-gray-600">Active Clients</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{carePlansCreated}</div>
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
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option>All Status</option>
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
              {filteredClients.length > 0 ? (
                filteredClients.map((client) => (
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {client.gender || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.class ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                          {client.class}
                        </span>
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
                            {client.patients_representatives[0].relationship} {client.patients_representatives[0].phone_number && `(${client.patients_representatives[0].phone_number})`}
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
                            {client.patients_representatives[1].relationship} {client.patients_representatives[1].phone_number && `(${client.patients_representatives[1].phone_number})`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={client.status === 'active'}
                          onChange={() => toggleStatus(client.id, client.status)}
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
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            View Details
                          </>
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
