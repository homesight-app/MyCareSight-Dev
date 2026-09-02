'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Loader2 } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { getAllLicenseRequirements, getStepsFromRequirement, copySteps } from '@/app/actions/license-requirements'
import { useRouter } from 'next/navigation'

interface Step {
  id: string
  step_name: string
  step_order: number
  description: string | null
}

interface LicenseRequirement {
  id: string
  state: string
  license_type: string
}

interface CopyStepsModalProps {
  isOpen: boolean
  onClose: () => void
  targetRequirementId: string | null
  onSuccess: () => void
}

export default function CopyStepsModal({
  isOpen,
  onClose,
  targetRequirementId,
  onSuccess
}: CopyStepsModalProps) {
  const [licenseRequirements, setLicenseRequirements] = useState<LicenseRequirement[]>([])
  const [selectedRequirementId, setSelectedRequirementId] = useState<string>('')
  const [availableSteps, setAvailableSteps] = useState<Step[]>([])
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()


  const loadLicenseRequirements = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getAllLicenseRequirements()
      if (result.error) {
        setError(result.error)
      } else {
        // Filter out the current license requirement
        const filtered = result.data?.filter(req => req.id !== targetRequirementId) || []
        setLicenseRequirements(filtered)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load license requirements')
    } finally {
      setIsLoading(false)
    }
  }, [targetRequirementId])
  
  useEffect(() => {
    if (isOpen) {
      loadLicenseRequirements()
      setSelectedRequirementId('')
      setAvailableSteps([])
      setSelectedStepIds(new Set())
      setError(null)
    }
  }, [isOpen, loadLicenseRequirements])

  const handleRequirementChange = async (requirementId: string) => {
    setSelectedRequirementId(requirementId)
    setSelectedStepIds(new Set())
    
    if (!requirementId) {
      setAvailableSteps([])
      return
    }
    
    setIsLoading(true)
    try {
      const result = await getStepsFromRequirement(requirementId)
      if (result.error) {
        setError(result.error)
        setAvailableSteps([])
      } else {
        setAvailableSteps(result.data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load steps')
      setAvailableSteps([])
    } finally {
      setIsLoading(false)
    }
  }

  const toggleStepSelection = (stepId: string) => {
    const newSelected = new Set(selectedStepIds)
    if (newSelected.has(stepId)) {
      newSelected.delete(stepId)
    } else {
      newSelected.add(stepId)
    }
    setSelectedStepIds(newSelected)
  }

  const handleCopy = async () => {
    if (!targetRequirementId || selectedStepIds.size === 0) return
    
    setIsCopying(true)
    setError(null)
    
    try {
      const result = await copySteps(targetRequirementId, Array.from(selectedStepIds))
      if (result.error) {
        setError(result.error)
      } else {
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to copy steps')
    } finally {
      setIsCopying(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Copy Steps from Another License</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Select License Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select License Type to Copy From
            </label>
            <select
              value={selectedRequirementId}
              onChange={(e) => handleRequirementChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            >
              <option value="">Select a license type...</option>
              {licenseRequirements.map((req) => (
                <option key={req.id} value={req.id}>
                  {req.state} - {req.license_type}
                </option>
              ))}
            </select>
          </div>

          {/* Select Steps */}
          {selectedRequirementId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Steps to Copy ({selectedStepIds.size} selected)
              </label>
              <div className="border border-gray-300 rounded-lg max-h-[300px] overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  </div>
                ) : availableSteps.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No steps available for this license type</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {availableSteps.map((step) => (
                      <label
                        key={step.id}
                        className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStepIds.has(step.id)}
                          onChange={() => toggleStepSelection(step.id)}
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">
                              {step.step_order}. {step.step_name}
                            </span>
                          </div>
                          {step.description && (
                            <p className="text-sm text-gray-600">{step.description}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isCopying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleCopy}
            disabled={isCopying || selectedStepIds.size === 0}
            loading={isCopying}
            icon={Copy}
          >
            Copy {selectedStepIds.size} {selectedStepIds.size === 1 ? 'Step' : 'Steps'}
          </Button>
        </div>
      </div>
    </div>
  )
}
