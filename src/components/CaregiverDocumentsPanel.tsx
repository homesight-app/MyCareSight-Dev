'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl } from '@/lib/supabase/storage'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import { uploadCaregiverDocumentsAction, deleteCaregiverDocumentAction } from '@/app/actions/caregiver-documents'
import { FileText, Upload, Download, Trash2, Loader2 } from 'lucide-react'
import { sanitizeDownloadFilename } from '@/lib/download-filename'

const BUCKET = 'staff-member-documents'
const LOG = '[CaregiverDocs]'

function caregiverDocsDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_CAREGIVER_DOCS === 'true'
  )
}

function logCaregiverDocs(_phase: string, _data?: Record<string, unknown>): void {
  if (!caregiverDocsDebugEnabled()) return
}

function logCaregiverDocsError(
  phase: string,
  err: unknown,
  extra?: Record<string, unknown>
): void {
  if (!caregiverDocsDebugEnabled()) return
  console.error(LOG, phase, extra ?? {}, err)
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && (err as { message: unknown }).message != null) {
    return String((err as { message: unknown }).message)
  }
  return 'Something went wrong'
}

function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '0 B'
  if (bytes === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

export interface CaregiverDocumentsPanelProps {
  /** When false, panel does not reset/sync from server props. */
  active: boolean
  staffMemberId: string
  caregiverName: string
  initialDocuments: PatientDocument[] | null | undefined
  /** List + download only (e.g. profile view). Hides upload and delete. */
  readOnly?: boolean
  /** Top border + padding (e.g. below a form). Omit in a standalone “manage documents” modal. */
  showTopSeparator?: boolean
  /** Upload or delete in progress — parent can block modal dismiss. In read-only mode, download in progress. */
  onBusyChange?: (busy: boolean) => void
}

export function CaregiverDocumentsPanel({
  active,
  staffMemberId,
  caregiverName,
  initialDocuments,
  readOnly = false,
  showTopSeparator = true,
  onBusyChange,
}: CaregiverDocumentsPanelProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<PatientDocument[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const busy = readOnly ? !!downloadingId : isUploading || !!deletingId
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    if (!active) return
    const raw = initialDocuments
    setDocs(Array.isArray(raw) ? [...raw] : [])
    setError(null)
  }, [active, staffMemberId, initialDocuments])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list?.length) return
    const filesArray = Array.from(list)
    e.target.value = ''
    setError(null)
    setIsUploading(true)
    try {
      const formData = new FormData()
      for (const file of filesArray) formData.append('file', file)
      const { error, data: nextDocs } = await uploadCaregiverDocumentsAction(staffMemberId, formData, docs)
      if (error) throw new Error(error)
      setDocs(nextDocs ?? docs)
      router.refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (doc: PatientDocument) => {
    if (!confirm(`Delete “${doc.name}”?`)) return
    setDeletingId(doc.id)
    setError(null)
    try {
      const next = docs.filter((d) => d.id !== doc.id)
      const { error } = await deleteCaregiverDocumentAction(staffMemberId, doc.path, next)
      if (error) throw new Error(error)
      setDocs(next)
      router.refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  const handleDownload = async (doc: PatientDocument) => {
    if (!doc.path) return
    setDownloadingId(doc.id)
    setError(null)
    try {
      const supabase = createClient()
      const signedUrl = await createSignedStorageUrl(supabase, BUCKET, doc.path)
      if (!signedUrl) throw new Error('Could not generate download link')
      const res = await fetch(signedUrl)
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = sanitizeDownloadFilename(doc.name)
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      setError('Could not download this file.')
    } finally {
      setDownloadingId(null)
    }
  }

  const count = docs.length

  return (
    <div className="space-y-4">
      <div className={showTopSeparator ? 'border-t border-gray-200 pt-6' : ''}>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
          Documents
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {readOnly
            ? `Files on file for ${caregiverName}. Your agency administrator can add or remove documents from staff management.`
            : `Upload or remove files for ${caregiverName}. Changes save immediately.`}
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="max-h-[min(40vh,320px)] overflow-y-auto pr-1 -mr-1">
        {!readOnly ? (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
              <Upload className="w-4 h-4 text-blue-600" aria-hidden />
              Upload New Documents
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed overflow-x-hidden"
            >
              {isUploading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading…
                </span>
              ) : (
                <span>
                  <span className="font-medium text-gray-900">Choose Files</span>
                  <span className="text-gray-500"> — No file chosen</span>
                </span>
              )}
            </button>
          </div>
        ) : null}

        <div className={readOnly ? '' : 'mt-4'}>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {readOnly ? 'Documents' : 'Uploaded Documents'}
          </h4>
          {docs.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              {readOnly ? 'No documents on file.' : 'No documents uploaded yet.'}
            </p>
          ) : (
            <ul className="space-y-2 overflow-x-hidden">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-blue-50/80 border border-blue-100 px-3 py-2.5 min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate" title={doc.name}>
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-500">{formatFileSize(doc.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.url ? (
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id || (!readOnly && !!deletingId)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                        aria-label={`Download ${doc.name}`}
                      >
                        {downloadingId === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                    ) : null}
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id || isUploading}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        aria-label={`Delete ${doc.name}`}
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <p className="text-sm text-gray-500">
          {count} document{count === 1 ? '' : 's'}
          {readOnly ? '' : ' uploaded'}
        </p>
      </div>
    </div>
  )
}
