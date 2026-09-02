'use client'

import { useState } from 'react'
import { Plus, X, Save } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { createLicenseType, type CreateLicenseTypeData } from '@/app/actions/license-types'
import Modal from './Modal'
import { US_STATES } from '@/lib/constants'

interface AddLicenseTypeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddLicenseTypeModal({ isOpen, onClose, onSuccess }: AddLicenseTypeModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<CreateLicenseTypeData>({
    state: 'California',
    name: '',
    description: '',
    processingTime: '',
    applicationFee: '',
    serviceFee: '',
    renewalPeriod: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name || !formData.description || !formData.processingTime || !formData.applicationFee || !formData.renewalPeriod) {
      setError('Please fill in all required fields')
      return
    }

    setIsLoading(true)
    const result = await createLicenseType(formData)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    // Reset form
    setFormData({
      state: 'California',
      name: '',
      description: '',
      processingTime: '',
      applicationFee: '',
      serviceFee: '',
      renewalPeriod: '',
    })
    
    onSuccess()
  }

  const handleClose = () => {
    if (!isLoading) {
      setError(null)
      setFormData({
        state: 'California',
        name: '',
        description: '',
        processingTime: '',
        applicationFee: '',
        serviceFee: '',
        renewalPeriod: '',
      })
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add License Type" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            State <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={isLoading}
          >
            {US_STATES.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            License Type Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Home Health Agency"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this license type"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Processing Time <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.processingTime}
            onChange={(e) => setFormData({ ...formData, processingTime: e.target.value })}
            placeholder="e.g., 60 days"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Application Fee <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.applicationFee}
            onChange={(e) => setFormData({ ...formData, applicationFee: e.target.value })}
            placeholder="e.g., $500"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Service Fee
          </label>
          <input
            type="text"
            value={formData.serviceFee}
            onChange={(e) => setFormData({ ...formData, serviceFee: e.target.value })}
            placeholder="e.g., $350"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1">Cost of helping the owner submit their license</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Renewal Period <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.renewalPeriod}
            onChange={(e) => setFormData({ ...formData, renewalPeriod: e.target.value })}
            placeholder="e.g., 1 year"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={isLoading}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="secondary"
            type="button"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={isLoading}
            loading={isLoading}
            icon={Save}
          >
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}
