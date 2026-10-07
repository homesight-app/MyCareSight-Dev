'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2 } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { uploadApplicationDocumentsAction } from '@/app/actions/application-documents'
import { APPLICATION_DOCUMENT_MAX_BYTES } from '@/lib/schemas/application-documents'
import { cleanupStoredFile, uploadStoredFile } from '@/lib/storage/browser'
import type { StoredFileUpload } from '@/lib/storage/contracts'

interface UploadDocumentButtonProps {
  applicationId: string
  className?: string
}

export default function UploadDocumentButton({
  applicationId,
  className = ''
}: UploadDocumentButtonProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadStatus('idle')
    setErrorMessage(null)
    let uploaded: StoredFileUpload | null = null

    try {
      if (file.size < 1 || file.size > APPLICATION_DOCUMENT_MAX_BYTES) {
        throw new Error('The file must be between 1 byte and 10 MB')
      }

      uploaded = await uploadStoredFile(file, 'application-document', applicationId)
      const result = await uploadApplicationDocumentsAction({
        applicationId,
        uploads: [{ ...uploaded, documentName: file.name }],
        documentType: null,
        description: null,
        status: 'draft',
        licenseRequirementDocumentId: null,
        applicationPlaybookItemId: null,
      })
      if (!result.success) {
        if (result.cleanupRequired !== false) await cleanupStoredFile(uploaded)
        uploaded = null
        throw new Error(result.error)
      }
      uploaded = null

      setUploadStatus('success')
      router.refresh()

      // Reset status after 2 seconds
      setTimeout(() => {
        setUploadStatus('idle')
      }, 2000)
    } catch (err: unknown) {
      if (uploaded) await cleanupStoredFile(uploaded)
      setUploadStatus('error')
      const errorMsg = err instanceof Error ? err.message : 'Failed to upload document. Please try again.'
      setErrorMessage(errorMsg)
      
      // Reset status after 5 seconds to give user time to read the error
      setTimeout(() => {
        setUploadStatus('idle')
        setErrorMessage(null)
      }, 5000)
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        disabled={isUploading}
      />
      <Button
        variant="primary"
        type="button"
        onClick={handleClick}
        disabled={isUploading}
        loading={isUploading}
        icon={uploadStatus === 'success' ? CheckCircle2 : Upload}
        className={className}
      >
        {isUploading ? 'Uploading...' : uploadStatus === 'success' ? 'Uploaded!' : 'Upload'}
      </Button>
      {uploadStatus === 'error' && errorMessage && (
        <div className="absolute top-full left-0 mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs max-w-xs z-10 shadow-lg">
          {errorMessage}
        </div>
      )}
    </div>
  )
}

