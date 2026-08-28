'use client'

import { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { Upload, X, Loader2, FileText } from 'lucide-react'
import { uploadApplicationDocumentsAction } from '@/app/actions/application-documents'

interface UploadDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  applicationId: string
  onSuccess?: () => void
  licenseRequirementDocumentId?: string
  applicationPlaybookItemId?: string
  defaultDocumentName?: string
  defaultDocumentType?: string
  autoApprove?: boolean
}

export default function UploadDocumentModal({
  isOpen,
  onClose,
  applicationId,
  onSuccess,
  licenseRequirementDocumentId,
  applicationPlaybookItemId,
  defaultDocumentName,
  defaultDocumentType,
  autoApprove = false,
}: UploadDocumentModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<Array<{ id: string; file: File; name: string }>>([])
  const [documentName, setDocumentName] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [description, setDescription] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill when opening for a specific license requirement document
  useEffect(() => {
    if (isOpen) {
      if (defaultDocumentName) setDocumentName(defaultDocumentName)
      if (defaultDocumentType) setDocumentType(defaultDocumentType)
    }
  }, [isOpen, defaultDocumentName, defaultDocumentType])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const newFiles: Array<{ id: string; file: File; name: string }> = Array.from(files).map((f, i) => ({
        id: `${Date.now()}-${i}`,
        file: f,
        name: f.name
      }))
      setSelectedFiles(prev => {
        // append new files
        const merged = [...prev, ...newFiles]
        // auto-fill documentName if empty and only one file selected total
        if (!documentName && merged.length === 1) {
          setDocumentName(merged[0].name)
        }
        return merged
      })
    }
  }

  const handleRemoveFile = (id?: string) => {
    if (!id) {
      setSelectedFiles([])
    } else {
      setSelectedFiles(prev => prev.filter(p => p.id !== id))
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFiles.length === 0 || !documentName) {
      setError('Please select at least one file and enter a document name')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      for (const fileItem of selectedFiles) formData.append('file', fileItem.file)
      if (documentType) formData.set('document_type', documentType)
      if (description.trim()) formData.set('description', description.trim())

      const result = await uploadApplicationDocumentsAction(applicationId, formData, {
        status: autoApprove ? 'approved' : 'draft',
        licenseRequirementDocumentId: licenseRequirementDocumentId ?? null,
        applicationPlaybookItemId: applicationPlaybookItemId ?? null,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setSelectedFiles([])
      setDocumentName('')
      setDocumentType('')
      setDescription('')
      if (fileInputRef.current) fileInputRef.current.value = ''

      onClose()
      onSuccess?.()
    } catch (err: any) {
      setError(err.message || 'Failed to upload document. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFiles([])
      setDocumentName('')
      setDocumentType('')
      setDescription('')
      setError(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Upload Document" size="md">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* File Upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Select File <span className="text-red-500">*</span>
          </label>
          {selectedFiles.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 font-medium mb-1">Click to upload or drag and drop</p>
              <p className="text-sm text-gray-500">PDF, DOCX (Max 10MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.docx"
                disabled={isUploading}
                multiple
              />
            </div>
          ) : (
            <div className="space-y-2">
              {selectedFiles.map((f) => (
                <div key={f.id} className="border border-gray-300 rounded-xl p-3 bg-gray-50 flex items-center gap-3">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={f.name}
                      onChange={(e) => setSelectedFiles(prev => prev.map(p => p.id === f.id ? { ...p, name: e.target.value } : p))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
                      disabled={isUploading}
                    />
                    <p className="text-sm text-gray-500 mt-1">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(f.id)}
                    disabled={isUploading}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document Name */}
        <div>
          <label htmlFor="documentName" className="block text-sm font-semibold text-gray-700 mb-2">
            Document Name <span className="text-red-500">*</span>
          </label>
          <input
            id="documentName"
            type="text"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            placeholder="e.g., Business License, Insurance Certificate"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isUploading}
            required
          />
        </div>

        {/* Document Type */}
        <div>
          <label htmlFor="documentType" className="block text-sm font-semibold text-gray-700 mb-2">
            Document Type (Optional)
          </label>
          <select
            id="documentType"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
            disabled={isUploading}
          >
            <option value="">Select document type</option>
            <option value="license">License</option>
            <option value="certificate">Certificate</option>
            <option value="insurance">Insurance</option>
            <option value="contract">Contract</option>
            <option value="policy">Policy</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
            Description (Optional)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description for this document..."
            rows={3}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
            disabled={isUploading}
          />
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="px-6 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isUploading || selectedFiles.length === 0 || !documentName}
            className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload Documents
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

