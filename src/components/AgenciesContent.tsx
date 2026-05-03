'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Eye } from 'lucide-react'
import AddAgencyModal, { type AgencyAdminOption } from './AddAgencyModal'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'

interface Agency {
  id: string
  name: string
  agency_admin_ids: string[] | null
  created_at: string
  updated_at: string
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

export default function AgenciesContent({
  agencies,
  agencyAdmins,
  agencyAdminsForSelect,
  detailBasePath,
}: AgenciesContentProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editAgency, setEditAgency] = useState<Agency | null>(null)

  // Add: only unassigned admins. Edit: show all agency admins in the checkbox list
  const agencyAdminsForSelectResolved = useMemo(() => {
    if (!editAgency) return agencyAdminsForSelect
    return agencyAdmins
  }, [editAgency, agencyAdmins, agencyAdminsForSelect])

  const openAdd = () => {
    setEditAgency(null)
    setModalOpen(true)
  }

  const openEdit = (agency: Agency) => {
    setEditAgency(agency)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditAgency(null)
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

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="px-4 py-4 sm:px-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900">All Agencies</h2>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Add New Agency
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Agency Name
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Agency Admin
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Created
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agencies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No agencies yet. Click &quot;Add New Agency&quot; to create one.
                  </td>
                </tr>
              ) : (
                agencies.map((agency) => (
                  <tr key={agency.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {agency.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                      {getAdminsDisplay(normalizeAgencyAdminIds(agency.agency_admin_ids))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(agency.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {detailBasePath && (
                          <Link
                            href={`${detailBasePath}/${agency.id}`}
                            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            aria-label="View agency details"
                          >
                            <Eye className="w-4 h-4" />
                            License
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(agency)}
                          className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          aria-label="Edit agency"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
        agencyAdminsForSelect={agencyAdminsForSelectResolved}
        editAgency={editAgency}
      />
    </>
  )
}
