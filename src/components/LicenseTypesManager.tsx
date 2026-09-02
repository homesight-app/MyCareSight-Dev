'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, X, FileText } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { createLicenseType, deleteLicenseType, type CreateLicenseTypeData } from '@/app/actions/license-types'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { US_STATES } from '@/lib/constants'

interface LicenseType {
  id: string
  state: string
  name: string
  description: string
  processing_time_display: string
  cost_display: string
  renewal_period_display: string
}

interface LicenseTypesManagerProps {
  initialState?: string
  selectedLicenseTypeId?: string | null
  onSelectLicenseType?: (licenseType: LicenseType | null) => void
  onStateChange?: (state: string) => void
}

export default function LicenseTypesManager({ 
  initialState = 'California',
  selectedLicenseTypeId,
  onSelectLicenseType,
  onStateChange
}: LicenseTypesManagerProps) {
  const [selectedState, setSelectedState] = useState(initialState)
  const [showForm, setShowForm] = useState(false)
  const [licenseTypes, setLicenseTypes] = useState<LicenseType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<CreateLicenseTypeData>({
    state: selectedState,
    name: '',
    description: '',
    processingTime: '',
    applicationFee: '',
    serviceFee: '',
    renewalPeriod: '',
  })

  const supabase = createClient()

  const loadLicenseTypes = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await q.getLicenseTypes(supabase, { state: selectedState, isActive: true })

      if (error) throw error
      setLicenseTypes(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState])

  // Load license types for selected state
  useEffect(() => {
    loadLicenseTypes()
  }, [selectedState, loadLicenseTypes])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name || !formData.description || !formData.processingTime || !formData.applicationFee || !formData.renewalPeriod) {
      setError('Please fill in all fields')
      return
    }

    setIsLoading(true)
    const result = await createLicenseType({
      ...formData,
      state: selectedState,
    })

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      // Reset form
      setFormData({
        state: selectedState,
        name: '',
        description: '',
        processingTime: '',
        applicationFee: '',
        serviceFee: '',
        renewalPeriod: '',
      })
      setShowForm(false)
      await loadLicenseTypes()
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this license type?')) {
      return
    }

    setIsDeleting(id)
    const result = await deleteLicenseType(id)

    if (result.error) {
      setError(result.error)
      setIsDeleting(null)
    } else {
      await loadLicenseTypes()
      setIsDeleting(null)
    }
  }

  const handleStateChange = (newState: string) => {
    setSelectedState(newState)
    setFormData(prev => ({ ...prev, state: newState }))
    setShowForm(false)
    onSelectLicenseType?.(null) // Clear selection when state changes
    onStateChange?.(newState)
  }


  return (
    <div className="space-y-4">
      {/* State Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Select State</label>
        <select
          value={selectedState}
          onChange={(e) => handleStateChange(e.target.value)}
          className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {US_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </div>

      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-base md:text-lg font-bold text-gray-900">License Types</h2>
        <Button
          variant="primary"
          type="button"
          icon={Plus}
          size="sm"
          onClick={() => {
            setShowForm(!showForm)
            setError(null)
          }}
        >
          <span className="hidden sm:inline">Add Type</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add Type Form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Add License Type</h3>
            <button
              onClick={() => {
                setShowForm(false)
                setError(null)
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                License Type Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Home Health Agency"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this license type"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Processing Time
              </label>
              <input
                type="text"
                value={formData.processingTime}
                onChange={(e) => setFormData({ ...formData, processingTime: e.target.value })}
                placeholder="e.g., 60 days"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Application Fee
              </label>
              <input
                type="text"
                value={formData.applicationFee}
                onChange={(e) => setFormData({ ...formData, applicationFee: e.target.value })}
                placeholder="e.g., $500"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Renewal Period
              </label>
              <input
                type="text"
                value={formData.renewalPeriod}
                onChange={(e) => setFormData({ ...formData, renewalPeriod: e.target.value })}
                placeholder="e.g., 1 year"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="primary" type="submit" disabled={isLoading} loading={isLoading} icon={Save}>
                Save
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* License Types List */}
      <div className="space-y-2">
        {isLoading && !showForm ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">Loading...</p>
          </div>
        ) : licenseTypes.length > 0 ? (
          licenseTypes.map((licenseType) => (
            <LicenseTypeItem
              key={licenseType.id}
              licenseType={licenseType}
              selectedState={selectedState}
              onDelete={handleDelete}
              isDeleting={isDeleting === licenseType.id}
              isSelected={selectedLicenseTypeId === licenseType.id}
              onSelect={() => onSelectLicenseType?.(licenseType)}
            />
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No license types</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface LicenseTypeItemProps {
  licenseType: LicenseType
  selectedState: string
  onDelete: (id: string) => void
  isDeleting: boolean
  isSelected: boolean
  onSelect: () => void
}

function LicenseTypeItem({ licenseType, selectedState, onDelete, isDeleting, isSelected, onSelect }: LicenseTypeItemProps) {
  const [counts, setCounts] = useState({ steps: 0, documents: 0 })
  const [loadingCounts, setLoadingCounts] = useState(true)
  const supabase = createClient()

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true)
    try {
      const { data: requirement } = await q.getLicenseRequirementByStateAndType(supabase, selectedState, licenseType.name)
      if (!requirement) {
        setCounts({ steps: 0, documents: 0 })
        setLoadingCounts(false)
        return
      }
      const { steps, documents } = await q.getRequirementCounts(supabase, requirement.id)
      setCounts({ steps, documents })
    } catch (error) {
      setCounts({ steps: 0, documents: 0 })
    } finally {
      setLoadingCounts(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseType.name, selectedState])

  useEffect(() => {
    loadCounts()
  }, [loadCounts])

  return (
    <div 
      className={`p-4 border border-gray-200 rounded-lg transition-colors cursor-pointer ${
        isSelected 
          ? 'bg-blue-50 border-blue-300' 
          : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{licenseType.name}</h3>
          {loadingCounts ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : (
            <p className="text-sm text-gray-600">
              {counts.steps} steps • {counts.documents} documents
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(licenseType.id)
          }}
          disabled={isDeleting}
          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
