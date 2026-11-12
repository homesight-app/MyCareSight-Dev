'use client'

import { useRef, useState } from 'react'
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { commitLeadDocumentUploadAction, deleteLeadDocumentAction } from '@/app/actions/leads'
import Button from '@/components/ui/PrimaryButton'
import { LEAD_DOCUMENT_TYPES } from '@/lib/schemas/lead-documents'
import { STORAGE_BUCKET } from '@/lib/storage'
import { cleanupStoredFile, downloadStoredFile, uploadStoredFile } from '@/lib/storage/browser'

export interface LeadDocument {
  id: string
  lead_id: string
  document_name: string
  file_url: string
  file_name: string | null
  document_type: string | null
  created_at: string
}

interface LeadDocumentsTabProps {
  leadId: string
  initialDocuments: LeadDocument[]
  canUpload: boolean
}

export default function LeadDocumentsTab({ leadId, initialDocuments, canUpload }: LeadDocumentsTabProps) {
  const [docs, setDocs] = useState<LeadDocument[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    if (file && !docName) setDocName(file.name.replace(/\.[^.]+$/, ''))
  }

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedFile || !docName.trim()) return
    setUploading(true)
    setUploadError(null)

    try {
      const uploaded = await uploadStoredFile(selectedFile, 'lead-document', leadId)
      const result = await commitLeadDocumentUploadAction({
        leadId,
        upload: uploaded,
        name: docName.trim(),
        originalFileName: selectedFile.name,
        documentType: docType || null,
        size: selectedFile.size,
      })
      if (result.error || !result.doc) {
        await cleanupStoredFile(uploaded)
        throw new Error(result.error ?? 'Unable to save document')
      }
      setDocs((current) => [result.doc as LeadDocument, ...current])
      setDocName('')
      setDocType('')
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      setShowForm(false)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unable to upload document')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = (doc: LeadDocument) => {
    downloadStoredFile(STORAGE_BUCKET.LEAD, doc.file_url)
  }

  const handleDelete = async (doc: LeadDocument) => {
    if (!confirm(`Delete "${doc.document_name}"?`)) return
    setDeletingId(doc.id)
    const result = await deleteLeadDocumentAction(leadId, doc.id)
    setDeletingId(null)
    if (result.error) {
      setUploadError(result.error)
      return
    }
    setDocs((current) => current.filter((item) => item.id !== doc.id))
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setShowForm((open) => !open)} icon={Upload}>Upload Document</Button>
        </div>
      )}
      {showForm && (
        <form onSubmit={handleUpload} noValidate className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-700">New Document</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Document Name <span className="text-red-500">*</span></label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={docName} onChange={(event) => setDocName(event.target.value)} placeholder="e.g. Proposal v1" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={docType} onChange={(event) => setDocType(event.target.value)}>
                <option value="">Select</option>
                {LEAD_DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">File <span className="text-red-500">*</span></label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={handleFileSelect} className="w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-200 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-300" required />
          </div>
          {uploadError && <p role="alert" className="text-sm text-red-600">{uploadError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => { setShowForm(false); setUploadError(null) }}>Cancel</Button>
            <Button type="submit" size="sm" loading={uploading} disabled={!selectedFile || !docName.trim()}>Upload</Button>
          </div>
        </form>
      )}
      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-gray-400">
          <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm">No documents yet.</p>
          {canUpload && <p className="mt-1 text-xs">Upload a proposal or contract above.</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full">
            <thead><tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
              <th className="w-32 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
              <th className="w-36 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Date</th>
              <th className="w-20 px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map((doc) => (
                <tr key={doc.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-gray-400" /><span className="text-sm font-medium text-gray-900">{doc.document_name}</span></div>{doc.file_name && <p className="ml-6 mt-0.5 text-xs text-gray-400">{doc.file_name}</p>}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{doc.document_type ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(doc.created_at)}</td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => handleDownload(doc)} className="rounded p-1.5 text-gray-400 transition-colors hover:text-gray-700" aria-label={`Download ${doc.document_name}`}><Download className="h-4 w-4" /></button>
                    {canUpload && <button type="button" onClick={() => handleDelete(doc)} disabled={deletingId === doc.id} className="rounded p-1.5 text-gray-400 transition-colors hover:text-red-500 disabled:opacity-50" aria-label={`Delete ${doc.document_name}`}>{deletingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
