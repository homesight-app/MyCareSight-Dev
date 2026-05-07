'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { insertCaregiverLicenseApplicationAction } from '@/app/actions/caregiver-licenses'
import { Loader2, Plus } from 'lucide-react'

const licenseSchema = z.object({
  license_type: z.string().min(1, 'License type is required'),
  license_number: z.string().min(1, 'License number is required'),
  state: z.string().optional(),
  expiry_date: z.string().optional(),
})

type LicenseFormData = z.infer<typeof licenseSchema>

export interface CaregiverLicenseRow {
  id: string
  license_type: string
  license_number: string
  state?: string | null
  status: string
  expiry_date?: string | null
  days_until_expiry?: number | null
}

interface AddCaregiverLicenseModalProps {
  isOpen: boolean
  onClose: () => void
  staffId: string
  staffName: string
  existingLicenses: CaregiverLicenseRow[]
  onSuccess?: () => void
}

export default function AddCaregiverLicenseModal({
  isOpen,
  onClose,
  staffId,
  staffName,
  existingLicenses,
  onSuccess,
}: AddCaregiverLicenseModalProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LicenseFormData>({
    resolver: zodResolver(licenseSchema),
    defaultValues: { license_type: '', license_number: '', state: '', expiry_date: '' },
  })

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const onSubmit = async (data: LicenseFormData) => {
    setFormError(null)
    try {
      const result = await insertCaregiverLicenseApplicationAction({
        staffMemberId: staffId,
        licenseType: data.license_type.trim(),
        licenseNumber: data.license_number.trim(),
        state: (data.state ?? '').trim(),
        expiryDate: data.expiry_date?.trim() ? data.expiry_date : null,
      })

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      reset()
      router.refresh()
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to add license. Please try again.'
      setFormError(msg)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      reset()
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Manage Certifications - ${staffName}`}
      size="lg"
      overlayClassName="z-[100]"
      lockBodyScroll={false}
      closeOnEscape={false}
    >
      <div className="space-y-6">
        {formError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        ) : null}
        {/* Existing Licenses (read-only summary — matches design) */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Existing Certifications</h4>
          {existingLicenses.length === 0 ? (
            <p className="text-sm text-gray-500">No certifications added yet.</p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-700">
              {existingLicenses.map((license) => (
                <li key={license.id} className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                  <span className="font-medium text-gray-900">{license.license_type}</span>
                  <span className="text-gray-500">
                    {' '}
                    — {license.license_number}
                    {license.state ? ` • ${license.state}` : ''}
                  </span>
                  {license.expiry_date ? (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Expires {formatDate(license.expiry_date)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Add New Certification</h4>
          <form
            className="space-y-4"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div>
              <label htmlFor="add_license_type" className="block text-sm font-semibold text-gray-700 mb-2">
                Certification Type <span className="text-red-500">*</span>
              </label>
              <input
                id="add_license_type"
                type="text"
                {...register('license_type')}
                placeholder="e.g., RN License, BLS Certification"
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isSubmitting}
              />
              {errors.license_type ? (
                <p className="mt-1 text-sm text-red-600">{errors.license_type.message}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="add_license_number" className="block text-sm font-semibold text-gray-700 mb-2">
                  Certification Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="add_license_number"
                  type="text"
                  {...register('license_number')}
                  placeholder="RN-2024-12345"
                  className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  disabled={isSubmitting}
                />
                {errors.license_number ? (
                  <p className="mt-1 text-sm text-red-600">{errors.license_number.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="add_state" className="block text-sm font-semibold text-gray-700 mb-2">
                  State <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  id="add_state"
                  type="text"
                  {...register('state')}
                  placeholder="Texas"
                  className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label htmlFor="add_expiry_date" className="block text-sm font-semibold text-gray-700 mb-2">
                Expiry Date <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                id="add_expiry_date"
                type="date"
                {...register('expiry_date')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Certification
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
