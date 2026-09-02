'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Loader2 } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { getAllLicenseRequirements, getDocumentsFromRequirement, copyDocuments } from '@/app/actions/license-requirements'
import { useRouter } from 'next/navigation'
interface Document {
  id: string
  document_name: string
  description: string | null
  is_required: boolean
}

interface LicenseRequirement {
  id: string
  state: string
  license_type: string
}

interface CopyDocumentsModalProps {
  isOpen: boolean
  onClose: () => void
  targetRequirementId: string | null
  onSuccess: () => void
}

export default function CopyDocumentsModal({
  isOpen,
  onClose,
  targetRequirementId,
  onSuccess
}: CopyDocumentsModalProps) {
  const [licenseRequirements, setLicenseRequirements] = useState<LicenseRequirement[]>([])
  const [selectedRequirementId, setSelectedRequirementId] = useState<string>('')
  const [availableDocuments, setAvailableDocuments] = useState<Document[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  },[targetRequirementId])
  
  useEffect(() => {
    if (isOpen) {
      loadLicenseRequirements()
      setSelectedRequirementId('')
      setAvailableDocuments([])
      setSelectedDocumentIds(new Set())
      setError(null)
    }
  }, [isOpen, loadLicenseRequirements])

  const handleRequirementChange = async (requirementId: string) => {
    setSelectedRequirementId(requirementId)
    setSelectedDocumentIds(new Set())
    
    if (!requirementId) {
      setAvailableDocuments([])
      return
    }
    
    setIsLoading(true)
    try {
      const result = await getDocumentsFromRequirement(requirementId)
      if (result.error) {
        setError(result.error)
        setAvailableDocuments([])
      } else {
        setAvailableDocuments(result.data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load documents')
      setAvailableDocuments([])
    } finally {
      setIsLoading(false)
    }
  }

  const toggleDocumentSelection = (documentId: string) => {
    const newSelected = new Set(selectedDocumentIds)
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId)
    } else {
      newSelected.add(documentId)
    }
    setSelectedDocumentIds(newSelected)
  }

  const handleCopy = async () => {
    if (!targetRequirementId || selectedDocumentIds.size === 0) return
    
    setIsCopying(true)
    setError(null)
    
    try {
      const result = await copyDocuments(targetRequirementId, Array.from(selectedDocumentIds))
      if (result.error) {
        setError(result.error)
      } else {
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to copy documents')
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
          <h2 className="text-xl font-semibold text-gray-900">Copy Documents from Another License</h2>
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

          {/* Select Documents */}
          {selectedRequirementId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Documents to Copy ({selectedDocumentIds.size} selected)
              </label>
              <div className="border border-gray-300 rounded-lg max-h-[300px] overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  </div>
                ) : availableDocuments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No documents available for this license type</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {availableDocuments.map((doc) => (
                      <label
                        key={doc.id}
                        className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocumentIds.has(doc.id)}
                          onChange={() => toggleDocumentSelection(doc.id)}
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">
                              {doc.document_name}
                            </span>
                            {doc.is_required && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                                Required
                              </span>
                            )}
                          </div>
                          {doc.description && (
                            <p className="text-sm text-gray-600">{doc.description}</p>
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
            disabled={isCopying || selectedDocumentIds.size === 0}
            loading={isCopying}
            icon={Copy}
          >
            Copy {selectedDocumentIds.size} {selectedDocumentIds.size === 1 ? 'Document' : 'Documents'}
          </Button>
        </div>
      </div>
    </div>
  )
}
