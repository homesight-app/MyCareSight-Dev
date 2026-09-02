'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2 } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { uploadApplicationDocumentsAction } from '@/app/actions/application-documents'

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

    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadApplicationDocumentsAction(applicationId, formData)
      if (result.error) throw new Error(result.error)

      setUploadStatus('success')
      router.refresh()

      // Reset status after 2 seconds
      setTimeout(() => {
        setUploadStatus('idle')
      }, 2000)
    } catch (err: any) {
      setUploadStatus('error')
      console.error('Upload error:', err)
      // Show more detailed error message
      const errorMsg = err.message || err.error?.message || 'Failed to upload document. Please try again.'
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

