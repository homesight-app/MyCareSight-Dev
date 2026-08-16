'use client'

import { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import { Upload, X, Loader2, Calendar, FileText } from 'lucide-react'
import type { CreateCertificationData } from '@/app/actions/certifications'
import { createMyStaffCertification } from '@/app/actions/staff-member-certifications'
import { createClient } from '@/lib/supabase/client'
import { uploadFile } from '@/lib/storage/client'
import { US_STATES } from '@/lib/constants'

interface AddCertificationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  certificationTypes: Array<{ id: string; name: string }>
}

export default function AddCertificationModal({
  isOpen,
  onClose,
  onSuccess,
  certificationTypes
}: AddCertificationModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<CreateCertificationData>({
    type: '',
    license_number: '',
    state: '',
    issue_date: '',
    expiration_date: '',
    issuing_authority: '',
    status: 'Active',
    document_url: null,
  })

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        type: '',
        license_number: '',
        state: '',
        issue_date: '',
        expiration_date: '',
        issuing_authority: '',
        status: 'Active',
        document_url: null,
      })
      setSelectedFile(null)
      setError(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [isOpen])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB')
        return
      }
      // Check file type
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
      if (!validTypes.includes(file.type)) {
        setError('File must be PDF, PNG, or JPG')
        return
      }
      setSelectedFile(file)
      setError(null)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB')
        return
      }
      // Check file type
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
      if (!validTypes.includes(file.type)) {
        setError('File must be PDF, PNG, or JPG')
        return
      }
      setSelectedFile(file)
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    if (!formData.type || !formData.license_number || !formData.expiration_date || !formData.issuing_authority) {
      setError('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)

    try {
      let documentUrl: string | null = null

      // Upload file if selected
      if (selectedFile) {
        setIsUploading(true)
        const supabase = createClient()

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('You must be logged in to upload documents')
          setIsSubmitting(false)
          setIsUploading(false)
          return
        }

        // Upload file to Supabase Storage
        const fileExt = selectedFile.name.split('.').pop()
        const fileName = `certifications/${user.id}/${Date.now()}.${fileExt}`
        const filePath = fileName

        const { path: uploadedPath, error: uploadError } = await uploadFile(
          supabase,
          'application-documents',
          filePath,
          selectedFile
        )

        if (uploadError) {
          throw uploadError
        }

        documentUrl = uploadedPath
        setIsUploading(false)
      }

      // Persist on caregiver_credentials (same source as agency "Manage certifications")
      const result = await createMyStaffCertification({
        ...formData,
        document_url: documentUrl,
      })

      if (result.error) {
        setError(result.error)
        setIsSubmitting(false)
        return
      }

      // Success
      if (onSuccess) {
        onSuccess()
      }
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to add certification. Please try again.')
    } finally {
      setIsSubmitting(false)
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting && !isUploading) {
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Certification" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Certification Type */}
        <div>
          <label htmlFor="type" className="block text-sm font-semibold text-gray-700 mb-2">
            Certification Type <span className="text-red-500">*</span>
          </label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isSubmitting || isUploading}
            required
          >
            <option value="">Select a certification type</option>
            {certificationTypes.map((type) => (
              <option key={type.id} value={type.name}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        {/* License/Certification Number */}
        <div>
          <label htmlFor="license_number" className="block text-sm font-semibold text-gray-700 mb-2">
            License/Certification Number <span className="text-red-500">*</span>
          </label>
          <input
            id="license_number"
            type="text"
            value={formData.license_number}
            onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
            placeholder="e.g., RN-2024-12345"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isSubmitting || isUploading}
            required
          />
        </div>

        {/* State */}
        <div>
          <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-2">
            State (if applicable)
          </label>
          <select
            id="state"
            value={formData.state || ''}
            onChange={(e) => setFormData({ ...formData, state: e.target.value || null })}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isSubmitting || isUploading}
          >
            <option value="">Select a state (optional)</option>
            {US_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        {/* Issue Date */}
        <div>
          <label htmlFor="issue_date" className="block text-sm font-semibold text-gray-700 mb-2">
            Issue Date
          </label>
          <div className="relative">
            <input
              id="issue_date"
              type="date"
              value={formData.issue_date || ''}
              onChange={(e) => setFormData({ ...formData, issue_date: e.target.value || null })}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all pr-10"
              disabled={isSubmitting || isUploading}
            />
            <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Expiration Date */}
        <div>
          <label htmlFor="expiration_date" className="block text-sm font-semibold text-gray-700 mb-2">
            Expiration Date <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="expiration_date"
              type="date"
              value={formData.expiration_date}
              onChange={(e) => {
                const expirationDate = e.target.value
                // Auto-update status based on expiration date
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const expiry = new Date(expirationDate)
                expiry.setHours(0, 0, 0, 0)
                
                // If expiration date is before today, status is Expired, otherwise Active
                const newStatus = expiry < today ? 'Expired' : 'Active'
                
                setFormData({ ...formData, expiration_date: expirationDate, status: newStatus })
              }}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all pr-10"
              disabled={isSubmitting || isUploading}
              required
            />
            <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Issuing Authority */}
        <div>
          <label htmlFor="issuing_authority" className="block text-sm font-semibold text-gray-700 mb-2">
            Issuing Authority <span className="text-red-500">*</span>
          </label>
          <input
            id="issuing_authority"
            type="text"
            value={formData.issuing_authority}
            onChange={(e) => setFormData({ ...formData, issuing_authority: e.target.value })}
            placeholder="e.g., Texas Board of Nursing"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isSubmitting || isUploading}
            required
          />
        </div>

        {/* Status */}
        <div>
          <label htmlFor="status" className="block text-sm font-semibold text-gray-700 mb-2">
            Status
          </label>
          <select
            id="status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isSubmitting || isUploading}
          >
            <option value="Active">Active</option>
            <option value="Expired">Expired</option>
            <option value="Pending">Pending</option>
          </select>
        </div>

        {/* Upload Certification Document */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Upload Certification Document (PDF or Image)
          </label>
          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600 mb-1">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-500">PDF, PNG, JPG up to 10MB</p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg"
                disabled={isSubmitting || isUploading}
              />
            </div>
          ) : (
            <div className="border border-gray-300 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isSubmitting || isUploading}
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isSubmitting || isUploading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting || isUploading}
          >
            {isSubmitting || isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isUploading ? 'Uploading...' : 'Adding...'}
              </>
            ) : (
              <>
                <span>+</span>
                Add Certification
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
