'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, CheckCircle2 } from 'lucide-react'
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
      <button
        onClick={handleClick}
        disabled={isUploading}
        className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isUploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : uploadStatus === 'success' ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Uploaded!
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload
          </>
        )}
      </button>
      {uploadStatus === 'error' && errorMessage && (
        <div className="absolute top-full left-0 mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs max-w-xs z-10 shadow-lg">
          {errorMessage}
        </div>
      )}
    </div>
  )
}

