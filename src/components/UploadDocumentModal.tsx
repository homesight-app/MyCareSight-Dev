'use client'

import { useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, Upload, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { uploadApplicationDocumentsAction } from '@/app/actions/application-documents'
import Button from '@/components/ui/PrimaryButton'
import { showSuccessToast, showValidationToast } from '@/lib/form-validation-toast'
import {
  APPLICATION_DOCUMENT_MAX_BYTES,
  applicationDocumentFormSchema,
  type ApplicationDocumentFormData,
} from '@/lib/schemas/application-documents'
import { cleanupStoredFile, uploadStoredFile } from '@/lib/storage/browser'
import type { StoredFileUpload } from '@/lib/storage/contracts'
import Modal from './Modal'

const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const STANDARD_DOCUMENT_TYPES = ['license', 'certificate', 'insurance', 'contract', 'policy', 'other']
const MAX_FILES = 20
const MAX_CONCURRENT_UPLOADS = 3

type SelectedFile = { id: string; file: File; name: string }

async function uploadFiles(
  files: SelectedFile[],
  applicationId: string
): Promise<PromiseSettledResult<StoredFileUpload>[]> {
  const results: PromiseSettledResult<StoredFileUpload>[] = new Array(files.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex++
      try {
        results[index] = {
          status: 'fulfilled',
          value: await uploadStoredFile(files[index].file, 'application-document', applicationId),
        }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, files.length) }, () => worker())
  )
  return results
}

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

function validateFile(file: File): string | null {
  if (file.size < 1) return 'Empty files cannot be uploaded'
  if (file.size > APPLICATION_DOCUMENT_MAX_BYTES) return 'Each file must be 10 MB or smaller'
  if (!ALLOWED_DOCUMENT_TYPES.has(file.type.toLowerCase())) return 'Only PDF and DOCX files are supported'
  return null
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
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
    setValue,
  } = useForm<ApplicationDocumentFormData>({
    resolver: zodResolver(applicationDocumentFormSchema),
    mode: 'onBlur',
    defaultValues: {
      documentName: '',
      documentType: '',
      description: '',
    },
  })

  useEffect(() => {
    if (isOpen) {
      reset({
        documentName: defaultDocumentName ?? '',
        documentType: defaultDocumentType ?? '',
        description: '',
      })
      setSelectedFiles([])
      setFileError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [defaultDocumentName, defaultDocumentType, isOpen, reset])

  const addFiles = (files: File[]) => {
    if (!files.length) return
    if (selectedFiles.length + files.length > MAX_FILES) {
      setFileError(`You can upload up to ${MAX_FILES} files at a time`)
      return
    }

    const invalid = files.map(validateFile).find(Boolean)
    if (invalid) {
      setFileError(invalid)
      return
    }

    const newFiles = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      name: file.name,
    }))
    const merged = [...selectedFiles, ...newFiles]
    setSelectedFiles(merged)
    setFileError(null)
    if (merged.length >= 1 && !defaultDocumentName) {
      setValue('documentName', merged[0].name, { shouldValidate: true })
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!isUploading) addFiles(Array.from(event.dataTransfer.files ?? []))
  }

  const handleRemoveFile = (id: string) => {
    setSelectedFiles(previous => previous.filter(item => item.id !== id))
    setFileError(null)
  }

  const onSubmit = async (data: ApplicationDocumentFormData) => {
    if (!selectedFiles.length) {
      setFileError('Select at least one file')
      return
    }
    if (selectedFiles.length > 1 && selectedFiles.some(file => !file.name.trim())) {
      setFileError('Enter a document name for every selected file')
      return
    }

    setIsUploading(true)
    const uploaded: StoredFileUpload[] = []

    try {
      const uploadResults = await uploadFiles(selectedFiles, applicationId)
      uploadResults.forEach(result => {
        if (result.status === 'fulfilled') uploaded.push(result.value)
      })
      const failedUpload = uploadResults.find(result => result.status === 'rejected')
      if (failedUpload) {
        await Promise.all(uploaded.map(cleanupStoredFile))
        throw failedUpload.reason
      }

      const result = await uploadApplicationDocumentsAction({
        applicationId,
        uploads: uploaded.map((upload, index) => ({
          ...upload,
          documentName: selectedFiles.length === 1 ? data.documentName : selectedFiles[index].name.trim(),
        })),
        documentType: data.documentType || null,
        description: data.description.trim() || null,
        status: autoApprove ? 'approved' : 'draft',
        licenseRequirementDocumentId: licenseRequirementDocumentId ?? null,
        applicationPlaybookItemId: applicationPlaybookItemId ?? null,
      })

      if (!result.success) {
        if (result.cleanupRequired !== false) await Promise.all(uploaded.map(cleanupStoredFile))
        uploaded.length = 0
        Object.entries(result.fieldErrors ?? {}).forEach(([field, messages]) => {
          if (field === 'documentType' || field === 'description') {
            setError(field, { message: messages[0] })
          } else if (field.startsWith('uploads.')) {
            setFileError(messages[0])
          }
        })
        showValidationToast({ error: result.error })
        return
      }

      reset()
      setSelectedFiles([])
      showSuccessToast('Document uploaded successfully')
      onClose()
      onSuccess?.()
    } catch (error: unknown) {
      if (uploaded.length) await Promise.all(uploaded.map(cleanupStoredFile))
      showValidationToast({
        error: error instanceof Error ? error.message : 'Failed to upload document. Please try again.',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (isUploading) return
    reset()
    setSelectedFiles([])
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Upload Document" size="md">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            Select File <span className="text-red-500">*</span>
          </label>
          {selectedFiles.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={event => event.preventDefault()}
              onDrop={handleDrop}
              className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-blue-500 hover:bg-blue-50"
            >
              <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="mb-1 font-medium text-gray-600">Click to upload or drag and drop</p>
              <p className="text-sm text-gray-500">PDF, DOCX (Max 10 MB each)</p>
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
              {selectedFiles.map(file => (
                <div key={file.id} className="flex items-center gap-3 rounded-xl border border-gray-300 bg-gray-50 p-3">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={file.name}
                      onChange={event => setSelectedFiles(previous => previous.map(item => (
                        item.id === file.id ? { ...item, name: event.target.value } : item
                      )))}
                      aria-label="Uploaded document name"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
                      disabled={isUploading || selectedFiles.length === 1}
                      maxLength={255}
                    />
                    <p className="mt-1 text-sm text-gray-500">{(file.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.id)}
                    disabled={isUploading}
                    className="rounded-lg p-2 transition-colors hover:bg-gray-200 disabled:opacity-50"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              ))}
              {selectedFiles.length < MAX_FILES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  Add another file
                </button>
              )}
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
          )}
          {fileError && <p className="mt-1 text-sm text-red-600">{fileError}</p>}
        </div>

        <div>
          <label htmlFor="documentName" className="mb-2 block text-sm font-semibold text-gray-700">
            Document Name <span className="text-red-500">*</span>
          </label>
          <input
            id="documentName"
            type="text"
            {...register('documentName')}
            placeholder="e.g., Business License, Insurance Certificate"
            className="block w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
            disabled={isUploading}
          />
          {errors.documentName && <p className="mt-1 text-sm text-red-600">{errors.documentName.message}</p>}
          {selectedFiles.length > 1 && (
            <p className="mt-1 text-xs text-gray-500">Each file name above will be used as its document name.</p>
          )}
        </div>

        <div>
          <label htmlFor="documentType" className="mb-2 block text-sm font-semibold text-gray-700">
            Document Type (Optional)
          </label>
          <select
            id="documentType"
            {...register('documentType')}
            className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
            disabled={isUploading}
          >
            <option value="">Select document type</option>
            {defaultDocumentType && !STANDARD_DOCUMENT_TYPES.includes(defaultDocumentType) && (
              <option value={defaultDocumentType}>{defaultDocumentType}</option>
            )}
            <option value="license">License</option>
            <option value="certificate">Certificate</option>
            <option value="insurance">Insurance</option>
            <option value="contract">Contract</option>
            <option value="policy">Policy</option>
            <option value="other">Other</option>
          </select>
          {errors.documentType && <p className="mt-1 text-sm text-red-600">{errors.documentType.message}</p>}
        </div>

        <div>
          <label htmlFor="description" className="mb-2 block text-sm font-semibold text-gray-700">
            Description (Optional)
          </label>
          <textarea
            id="description"
            {...register('description')}
            placeholder="Add a description for this document..."
            rows={3}
            className="block w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
            disabled={isUploading}
          />
          {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            icon={Upload}
            disabled={isUploading || selectedFiles.length === 0}
            loading={isUploading}
          >
            Upload Documents
          </Button>
        </div>
      </form>
    </Modal>
  )
}
