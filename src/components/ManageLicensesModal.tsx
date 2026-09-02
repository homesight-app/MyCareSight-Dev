'use client'

import { useState, useEffect } from 'react'
import Modal from './Modal'
import { Plus } from 'lucide-react'
import AddCaregiverLicenseModal, { type CaregiverLicenseRow } from './AddCaregiverLicenseModal'

interface ManageLicensesModalProps {
  isOpen: boolean
  onClose: () => void
  staffId: string
  staffName: string
  existingLicenses: CaregiverLicenseRow[]
  onSuccess?: () => void
}

export default function ManageLicensesModal({
  isOpen,
  onClose,
  staffId,
  staffName,
  existingLicenses,
  onSuccess,
}: ManageLicensesModalProps) {
  const [isAddOpen, setIsAddOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) setIsAddOpen(false)
  }, [isOpen])


  const handleMainModalClose = () => {
    if (isAddOpen) {
      setIsAddOpen(false)
      return
    }
    onClose()
  }

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleMainModalClose}
        title={`Manage Certifications - ${staffName}`}
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Existing Certifications</h4>
            {existingLicenses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No certifications added yet.</p>
            ) : (
              <ul className="space-y-3">
                {existingLicenses.map((license) => {
                  const daysRemaining =
                    license.days_until_expiry !== null && license.days_until_expiry !== undefined
                      ? license.days_until_expiry
                      : null
                  const statusLabel =
                    license.status === 'approved' || license.status === 'active'
                      ? 'Active'
                      : license.status === 'rejected' || license.status === 'expired'
                        ? 'Expired'
                        : license.status
                  return (
                    <li
                      key={license.id}
                      className="rounded-xl border border-gray-100 bg-gray-50/90 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{license.license_type}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            statusLabel === 'Active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-gray-600">
                        {license.license_number}
                        {license.state ? ` • ${license.state}` : ''}
                      </div>
                      {license.expiry_date ? (
                        <div className="text-gray-600 mt-1">
                          Expires: {formatDate(license.expiry_date)}
                          {daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 60 ? (
                            <span className="ml-2 font-medium text-amber-700">
                              ({daysRemaining} days remaining)
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-4 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50/80 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5 text-gray-500" />
            Add New Certification
          </button>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleMainModalClose}
              className="px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-brand-hover transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      <AddCaregiverLicenseModal
        isOpen={isOpen && isAddOpen}
        onClose={() => setIsAddOpen(false)}
        staffId={staffId}
        staffName={staffName}
        existingLicenses={existingLicenses}
        onSuccess={() => {
          onSuccess?.()
        }}
      />
    </>
  )
}
