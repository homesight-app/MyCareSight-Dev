'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, UserPlus, X, Loader2, Mail } from 'lucide-react'
import { addAdminToAgency, removeAdminFromAgency } from '@/app/actions/agencies'
import Button from '@/components/ui/PrimaryButton'

interface AdminRecord {
  id: string
  contact_name?: string | null
  contact_email?: string | null
}

interface AgencyAdminsSectionProps {
  agencyId: string
  agencyAdmins: AdminRecord[]
  availableAdmins: AdminRecord[]
}

export default function AgencyAdminsSection({
  agencyId,
  agencyAdmins,
  availableAdmins,
}: AgencyAdminsSectionProps) {
  const router = useRouter()
  const [selectedAdminId, setSelectedAdminId] = useState('')
  const [addingError, setAddingError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!selectedAdminId) return
    setIsAdding(true)
    setAddingError(null)
    const result = await addAdminToAgency(agencyId, selectedAdminId)
    setIsAdding(false)
    if (result.error) {
      setAddingError(result.error)
      return
    }
    setSelectedAdminId('')
    router.refresh()
  }

  const handleRemove = async (adminId: string) => {
    setRemovingId(adminId)
    await removeAdminFromAgency(agencyId, adminId)
    setRemovingId(null)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-600" />
        <h2 className="text-base font-semibold text-gray-900">Agency Admins</h2>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Current admins */}
        {agencyAdmins.length === 0 ? (
          <p className="px-6 py-5 text-sm text-gray-500">No admins assigned to this agency yet.</p>
        ) : (
          agencyAdmins.map((admin) => (
            <div key={admin.id} className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700 font-semibold text-sm">
                  {(admin.contact_name || admin.contact_email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {admin.contact_name || 'Unnamed Admin'}
                  </p>
                  {admin.contact_email && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      {admin.contact_email}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(admin.id)}
                disabled={removingId === admin.id}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                aria-label={`Remove ${admin.contact_name ?? 'admin'}`}
              >
                {removingId === admin.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <X className="w-4 h-4" />}
                Remove
              </button>
            </div>
          ))
        )}

        {/* Add admin row */}
        {availableAdmins.length > 0 && (
          <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <select
              value={selectedAdminId}
              onChange={(e) => { setSelectedAdminId(e.target.value); setAddingError(null) }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an admin to add…</option>
              {availableAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.contact_name || a.contact_email || a.id}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              type="button"
              onClick={handleAdd}
              disabled={!selectedAdminId}
              loading={isAdding}
              icon={UserPlus}
              className="flex-shrink-0"
            >
              Add Admin
            </Button>
          </div>
        )}

        {addingError && (
          <p className="px-6 py-2 text-sm text-red-600">{addingError}</p>
        )}
      </div>
    </div>
  )
}
