'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { revalidateLicensesPage, createLicenseForAgency } from '@/app/actions/licenses'
import { Loader2, Upload, X, FileText } from 'lucide-react'
import Modal from './Modal'
import { US_STATES } from '@/lib/constants'

const licenseSchema = z.object({
  license_name: z.string().min(1, 'License name is required').min(3, 'License name must be at least 3 characters'),
  license_number: z.string().optional(),
  state: z.string().min(1, 'State is required'),
  expiry_date: z.string().min(1, 'Expiry date is required'),
  activated_date: z.string().min(1, 'Activated date is required'),
  renewal_due_date: z.string().optional(),
})

export type CreateLicenseFormData = z.infer<typeof licenseSchema>

interface CreateLicenseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** When provided, the modal operates in agency mode: license is created via
   *  server action (admin client) and attached to the agency instead of the
   *  current user. Used by admin/expert on the agency detail page. */
  agencyId?: string
  agencyName?: string
  /** When provided, the modal operates in edit mode: pre-populates the form
   *  and calls updateLicenseById on submit instead of inserting a new row. */
  licenseToEdit?: {
    id: string
    license_name: string
    license_number?: string | null
    state?: string | null
    activated_date?: string | null
    expiry_date?: string | null
    renewal_due_date?: string | null
  }
}

export default function CreateLicenseModal({
  isOpen,
  onClose,
  onSuccess,
  agencyId,
  agencyName,
  licenseToEdit,
}: CreateLicenseModalProps) {
  const isEditMode = !!licenseToEdit
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentName, setDocumentName] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [documentTypeError, setDocumentTypeError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateLicenseFormData>({
    resolver: zodResolver(licenseSchema),
    defaultValues: {
      license_name: licenseToEdit?.license_name ?? '',
      license_number: licenseToEdit?.license_number ?? '',
      state: licenseToEdit?.state ?? '',
      expiry_date: licenseToEdit?.expiry_date?.split('T')[0] ?? '',
      activated_date: licenseToEdit?.activated_date?.split('T')[0] ?? '',
      renewal_due_date: licenseToEdit?.renewal_due_date?.split('T')[0] ?? '',
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      if (!documentName) setDocumentName(file.name)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setDocumentName('')
    setDocumentType('')
    setDocumentTypeError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onSubmit = async (data: CreateLicenseFormData) => {
    setDocumentTypeError(null)
    if (selectedFile && documentName.trim() && !documentType.trim()) {
      setDocumentTypeError('Document type is required when uploading a document')
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const supabase = createClient()

      // ── Edit mode: update existing license ─────────────────────────────
      if (isEditMode && licenseToEdit) {
        const { error: updateError } = await q.updateLicenseById(supabase, licenseToEdit.id, {
          license_name: data.license_name,
          license_number: data.license_number || null,
          state: data.state,
          activated_date: data.activated_date || null,
          expiry_date: data.expiry_date,
          renewal_due_date: data.renewal_due_date || null,
        })
        if (updateError) throw updateError

        // Optionally upload a new document version
        if (selectedFile && documentName.trim()) {
          const fileExt = selectedFile.name.split('.').pop()
          const fileName = `license-${licenseToEdit.id}/${Date.now()}.${fileExt}`
          const { error: uploadError } = await supabase.storage
            .from('application-documents')
            .upload(fileName, selectedFile, { upsert: false, contentType: selectedFile.type || `application/${fileExt}` })
          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

          const { error: docError } = await q.insertLicenseDocument(supabase, {
            license_id: licenseToEdit.id,
            document_name: documentName.trim(),
            document_url: fileName,
            document_type: documentType || null,
          })
          if (docError) {
            await supabase.storage.from('application-documents').remove([fileName])
            throw new Error(`Document record failed: ${docError.message}`)
          }
        }

        reset()
        handleRemoveFile()
        router.refresh()
        onClose()
        onSuccess()
        return
      }

      // ── Agency mode (admin/expert) ──────────────────────────────────────
      if (agencyId) {
        let docPayload: { url: string; name: string; type: string | null; expiry_date?: string } | undefined

        if (selectedFile && documentName.trim()) {
          const fileExt = selectedFile.name.split('.').pop()
          const fileName = `agency-${agencyId}/${Date.now()}.${fileExt}`
          const { error: uploadError } = await supabase.storage
            .from('application-documents')
            .upload(fileName, selectedFile, {
              upsert: false,
              contentType: selectedFile.type || `application/${fileExt}`,
              cacheControl: '3600',
            })
          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

          docPayload = {
            url: fileName,
            name: documentName.trim(),
            type: documentType || null,
          }
          if (data.expiry_date) docPayload.expiry_date = data.expiry_date
        }

        const result = await createLicenseForAgency({
          agencyId,
          license_name: data.license_name,
          license_number: data.license_number || undefined,
          state: data.state,
          activated_date: data.activated_date,
          expiry_date: data.expiry_date,
          renewal_due_date: data.renewal_due_date || undefined,
          document: docPayload,
        })

        if (result.error) {
          // Clean up uploaded file if server action failed
          if (docPayload?.url) {
            await supabase.storage.from('application-documents').remove([docPayload.url])
          }
          throw new Error(result.error)
        }

        reset()
        handleRemoveFile()
        router.refresh()
        onClose()
        onSuccess()
        return
      }

      // ── Owner mode (agency-owner creates for themselves) ─────────────────
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        setSubmitError('You must be logged in to create a license')
        return
      }

      const { data: newLicense, error } = await q.insertLicenseReturning(supabase, {
        company_owner_id: authUser.id,
        license_name: data.license_name,
        license_number: data.license_number || null,
        state: data.state,
        status: 'active',
        expiry_date: data.expiry_date,
        activated_date: data.activated_date || null,
        renewal_due_date: data.renewal_due_date || null,
      })

      if (error) throw error
      if (!newLicense?.id) throw new Error('License was created but no ID returned')

      if (selectedFile && documentName.trim()) {
        const fileExt = selectedFile.name.split('.').pop()
        const fileName = `${newLicense.id}/${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('application-documents')
          .upload(fileName, selectedFile, {
            upsert: false,
            contentType: selectedFile.type || `application/${fileExt}`,
            cacheControl: '3600',
          })
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

        const docData: { license_id: string; document_name: string; document_url: string; document_type: string | null; expiry_date?: string } = {
          license_id: newLicense.id,
          document_name: documentName.trim(),
          document_url: fileName,
          document_type: documentType || null,
        }
        if (data.expiry_date) docData.expiry_date = data.expiry_date

        const { error: docError } = await q.insertLicenseDocument(supabase, docData)
        if (docError) {
          await supabase.storage.from('application-documents').remove([fileName])
          throw new Error(`Document record failed: ${docError.message}`)
        }
      }

      await revalidateLicensesPage()
      reset()
      handleRemoveFile()
      onClose()
      onSuccess()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create license. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    reset()
    handleRemoveFile()
    onClose()
  }

  const title = isEditMode
    ? `Edit License — ${licenseToEdit!.license_name}`
    : agencyId && agencyName
    ? `Add License — ${agencyName}`
    : 'Create License'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {submitError}
          </div>
        )}
        <div>
          <label htmlFor="license_name" className="block text-sm font-semibold text-gray-700 mb-1">
            License Name <span className="text-red-500">*</span>
          </label>
          <input
            id="license_name"
            type="text"
            {...register('license_name')}
            placeholder="e.g., Home Care Agency License"
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {errors.license_name && (
            <p className="mt-1 text-sm text-red-600">{errors.license_name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-1">
            State <span className="text-red-500">*</span>
          </label>
          <select
            id="state"
            {...register('state')}
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
          >
            <option value="">Select a state</option>
            {US_STATES.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
          {errors.state && (
            <p className="mt-1 text-sm text-red-600">{errors.state.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="license_number" className="block text-sm font-semibold text-gray-700 mb-1">
            License Number
          </label>
          <input
            id="license_number"
            type="text"
            {...register('license_number')}
            placeholder="e.g., HC-12345"
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {errors.license_number && (
            <p className="mt-1 text-sm text-red-600">{errors.license_number.message}</p>
          )}
        </div>

        {/* Optional document upload */}
        <div className="border-t border-gray-200 pt-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Upload document (optional)
          </label>
          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors"
            >
              <Upload className="w-10 h-10 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-600 font-medium text-sm">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-500 mt-0.5">PDF, DOC, DOCX, JPG, PNG (max 10MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                disabled={isSubmitting}
              />
            </div>
          ) : (
            <div className="border border-gray-300 rounded-xl p-4 bg-gray-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileText className="w-8 h-8 text-blue-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveFile}
                disabled={isSubmitting}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                aria-label="Remove file"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          )}
          {selectedFile && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="create_license_doc_name" className="block text-xs font-medium text-gray-600 mb-1">
                  Document name
                </label>
                <input
                  id="create_license_doc_name"
                  type="text"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="e.g., License certificate"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="create_license_doc_type" className="block text-xs font-medium text-gray-600 mb-1">
                  Document type <span className="text-red-500">*</span>
                </label>
                <select
                  id="create_license_doc_type"
                  value={documentType}
                  onChange={(e) => {
                    setDocumentType(e.target.value)
                    setDocumentTypeError(null)
                  }}
                  className={`block w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white ${
                    documentTypeError ? 'border-red-500 border' : 'border border-gray-300'
                  }`}
                  disabled={isSubmitting}
                >
                  <option value="">Select type</option>
                  <option value="license">License</option>
                  <option value="certificate">Certificate</option>
                  <option value="insurance">Insurance</option>
                  <option value="contract">Contract</option>
                  <option value="policy">Policy</option>
                  <option value="other">Other</option>
                </select>
                {documentTypeError && (
                  <p className="mt-1 text-sm text-red-600">{documentTypeError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="expiry_date" className="block text-sm font-semibold text-gray-700 mb-1">
            Expiry Date <span className="text-red-500">*</span>
          </label>
          <input
            id="expiry_date"
            type="date"
            {...register('expiry_date')}
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {errors.expiry_date && (
            <p className="mt-1 text-sm text-red-600">{errors.expiry_date.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="activated_date" className="block text-sm font-semibold text-gray-700 mb-1">
              Activated Date <span className="text-red-500">*</span>
            </label>
            <input
              id="activated_date"
              type="date"
              {...register('activated_date')}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            {errors.activated_date && (
              <p className="mt-1 text-sm text-red-600">{errors.activated_date.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="renewal_due_date" className="block text-sm font-semibold text-gray-700 mb-1">
              Renewal Due Date
            </label>
            <input
              id="renewal_due_date"
              type="date"
              {...register('renewal_due_date')}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {agencyId ? 'Adding…' : 'Creating...'}
              </>
            ) : (
              isEditMode ? 'Save Changes' : agencyId ? 'Add License' : 'Create License'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
