'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { FileText, Download, Image as ImageIcon, Loader2, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'

interface CertificationDocumentViewerProps {
  documentUrl: string | null | undefined
  certificationName: string
}

export default function CertificationDocumentViewer({
  documentUrl,
  certificationName
}: CertificationDocumentViewerProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!documentUrl) return
    const supabase = createClient()
    createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, documentUrl).then(url => {
      setSignedUrl(url)
    })
  }, [documentUrl])

  if (!documentUrl) {
    return null
  }

  const getFileExtension = (path: string): string => {
    const parts = path.split('.')
    if (parts.length > 1) {
      return parts[parts.length - 1].split('?')[0].toLowerCase()
    }
    return ''
  }

  const isImageFile = (path: string): boolean => {
    const ext = getFileExtension(path)
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
  }

  const handleDownload = async () => {
    if (!signedUrl) return

    setIsDownloading(true)
    try {
      const response = await fetch(signedUrl)
      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const extension = getFileExtension(documentUrl) || 'pdf'
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const safeCertName = certificationName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      a.download = `${safeCertName}_certification.${extension}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Error downloading file:', error)
      alert('Failed to download file. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  const fileExtension = getFileExtension(documentUrl)
  const isImage = isImageFile(documentUrl)

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {isImage ? (
          <ImageIcon className="w-5 h-5 text-blue-600" />
        ) : (
          <FileText className="w-5 h-5 text-blue-600" />
        )}
        {isImage ? 'Certification Image' : 'Certification Document'}
      </h2>

      <div className="space-y-4">
        {/* Image Preview */}
        {isImage && (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            {!imageError && signedUrl ? (
              <div className="relative w-full max-w-2xl min-h-[200px] aspect-video max-h-96">
                <Image
                  src={signedUrl}
                  alt={`${certificationName} certification`}
                  fill
                  className="object-contain"
                  onError={() => setImageError(true)}
                  sizes="(max-width: 672px) 100vw, 672px"
                />
              </div>
            ) : (
              <div className="p-8 text-center">
                <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-1">Unable to load image preview</p>
                <p className="text-xs text-gray-500">Click &quot;View Full Image&quot; or &quot;Download&quot; to access the file</p>
              </div>
            )}
          </div>
        )}

        {/* Document Preview Placeholder for non-images */}
        {!isImage && (
          <div className="border border-gray-200 rounded-lg p-8 bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-1">
                {fileExtension.toUpperCase()} Document
              </p>
                <p className="text-xs text-gray-500">
                Click &quot;View Document&quot; to open in a new tab
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <a
            href={signedUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors ${!signedUrl ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <ExternalLink className="w-4 h-4" />
            {isImage ? 'View Full Image' : 'View Document'}
          </a>

          <Button
            variant="secondary"
            onClick={handleDownload}
            disabled={isDownloading || !signedUrl}
            loading={isDownloading}
            icon={isDownloading ? undefined : Download}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  )
}
