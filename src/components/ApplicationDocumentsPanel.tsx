'use client'

import { useState, useEffect, useCallback } from 'react'
import { Folder, Download, FileText } from 'lucide-react'
import * as q from '@/app/actions/query-bridge'
import { STORAGE_BUCKET } from '@/lib/storage/contracts'
import { getStoredFileSize, saveStoredFile } from '@/lib/storage/browser'

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
      const { data, error } = await q.getApplicationDocumentsByApplicationId(applicationId)

      if (error) {
        console.error('Error fetching documents:', error)
        return
      }

      setDocuments(data || [])
      setFileSizes({})
      // The record list and download buttons do not wait for optional size metadata.
      setIsLoading(false)

      // Fetch file sizes for each document
      if (data && data.length > 0) {
        const sizes: Record<string, string> = {}
        let nextIndex = 0
        const readSizes = async () => {
          while (nextIndex < data.length) {
            const doc = data[nextIndex++]
            try {
              const bytes = await getStoredFileSize(STORAGE_BUCKET.APPLICATION, doc.document_url)
              sizes[doc.id] = formatFileSize(bytes)
            } catch {
              sizes[doc.id] = 'Unknown'
            }
          }
        }
        // The existing query caps this list at 100; never burst 100 metadata requests at once.
        await Promise.all(Array.from({ length: Math.min(4, data.length) }, readSizes))
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
      await saveStoredFile(STORAGE_BUCKET.APPLICATION, documentPath, documentName)
    } catch {
      alert('Failed to download document. Please try again.')
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
