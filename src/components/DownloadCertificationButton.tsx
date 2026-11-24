'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { STORAGE_BUCKET } from '@/lib/storage/contracts'
import { saveStoredFile } from '@/lib/storage/browser'

interface DownloadCertificationButtonProps {
  documentUrl: string | null | undefined
  certificationName: string
  staffName: string
  disabled?: boolean
}

export default function DownloadCertificationButton({
  documentUrl,
  certificationName,
  staffName,
  disabled = false
}: DownloadCertificationButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    if (!documentUrl || disabled) return

    setIsDownloading(true)
    try {
      const urlParts = documentUrl.split('.')
      const extension = urlParts.length > 1 ? urlParts[urlParts.length - 1].split('?')[0] : 'pdf'
      const safeStaffName = staffName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      const safeCertName = certificationName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      await saveStoredFile(STORAGE_BUCKET.APPLICATION, documentUrl, `${safeStaffName}_${safeCertName}.${extension}`)
    } catch {
      alert('Failed to download file. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  if (!documentUrl) {
    return (
      <button
        disabled
        className="px-3 py-1.5 text-sm text-gray-400 cursor-not-allowed flex items-center gap-1.5"
        title="No document available"
      >
        <Download className="w-4 h-4" />
        Download
      </button>
    )
  }

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading || disabled}
      className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Download certification document"
    >
      {isDownloading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Downloading...
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Download
        </>
      )}
    </button>
  )
}
