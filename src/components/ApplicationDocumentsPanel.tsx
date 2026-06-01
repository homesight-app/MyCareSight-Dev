'use client'

import { useState, useEffect, useCallback } from 'react'
import { Folder, Download, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'

interface Document {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string
  created_at: string
}

interface ApplicationDocumentsPanelProps {
  applicationId: string
  documentCount: number
  onDocumentUploaded?: () => void
}

export default function ApplicationDocumentsPanel({
  applicationId,
}: ApplicationDocumentsPanelProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fileSizes, setFileSizes] = useState<Record<string, string>>({})

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await q.getApplicationDocumentsByApplicationId(supabase, applicationId)

      if (error) {
        console.error('Error fetching documents:', error)
        return
      }

      setDocuments(data || [])

      // Fetch file sizes for each document
      if (data && data.length > 0) {
        const sizes: Record<string, string> = {}
        await Promise.all(
          data.map(async (doc) => {
            try {
              const docSignedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, doc.document_url)
              if (docSignedUrl) {
                const response = await fetch(docSignedUrl, { method: 'HEAD' })
                const contentLength = response.headers.get('content-length')
                if (contentLength) {
                  const bytes = parseInt(contentLength, 10)
                  sizes[doc.id] = formatFileSize(bytes)
                }
              }
            } catch (err) {
              console.error('Error fetching file size:', err)
              sizes[doc.id] = 'Unknown'
            }
          })
        )
        setFileSizes(sizes)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [applicationId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  const handleDownload = async (documentPath: string, documentName: string) => {
    try {
      const supabase = createClient()
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, documentPath)
      if (!signedUrl) throw new Error('Failed to generate download URL')
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = documentName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading file:', error)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Application Documents</h3>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
            {isLoading ? '...' : documents.length}
          </span>
        </div>
        
      </div>

      {/* Documents List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No documents uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 truncate">{document.document_name}</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    {fileSizes[document.id] || 'Loading...'} • {formatDate(document.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDownload(document.document_url, document.document_name)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
                title="Download"
              >
                <Download className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

