'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, Trash2, Download, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import { uploadLeadDocument, deleteLeadDocumentAction } from '@/app/actions/leads'

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

const DOC_TYPES = ['Proposal', 'Contract', 'Agreement', 'Invoice', 'NDA', 'Other']

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

  const supabase = createClient()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    if (file && !docName) setDocName(file.name.replace(/\.[^.]+$/, ''))
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !docName.trim()) return
    setUploading(true)
    setUploadError(null)

    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('document_name', docName.trim())
    fd.append('document_type', docType || '')

    const result = await uploadLeadDocument(leadId, fd)
    setUploading(false)

    if (result.error) { setUploadError(result.error); return }

    setDocs(prev => [{
      id: result.doc!.id,
      lead_id: leadId,
      document_name: result.doc!.document_name,
      file_url: result.doc!.file_url,
      file_name: selectedFile.name,
      document_type: docType || null,
      created_at: new Date().toISOString(),
    }, ...prev])
    setDocName('')
    setDocType('')
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowForm(false)
  }

  const handleDownload = async (doc: LeadDocument) => {
    const url = await createSignedStorageUrl(supabase, STORAGE_BUCKET.LEAD, doc.file_url)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name ?? doc.document_name
    a.click()
  }

  const handleDelete = async (doc: LeadDocument) => {
    if (!confirm(`Delete "${doc.document_name}"?`)) return
    setDeletingId(doc.id)
    const result = await deleteLeadDocumentAction(leadId, doc.id, doc.file_url)
    setDeletingId(null)
    if (result.error) { alert(result.error); return }
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(v => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleUpload} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">New Document</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Document Name <span className="text-red-500">*</span></label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={docName}
                onChange={e => setDocName(e.target.value)}
                placeholder="e.g. Proposal v1"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={docType}
                onChange={e => setDocType(e.target.value)}
              >
                <option value="">— Select —</option>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">File <span className="text-red-500">*</span></label>
            <input
              ref={fileRef}
              type="file"
              onChange={handleFileSelect}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-200 file:text-gray-700 hover:file:bg-gray-300"
              required
            />
          </div>

          {uploadError && (
            <p className="text-sm text-red-600">{uploadError}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setUploadError(null) }}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !selectedFile || !docName.trim()}
              className="px-3 py-1.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50 flex items-center gap-1.5"
            >
              {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      )}

      {docs.length === 0 ? (
        <div className="py-12 text-center text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No documents yet.</p>
          {canUpload && <p className="text-xs mt-1">Upload a proposal or contract above.</p>}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-32">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-36">Date</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{doc.document_name}</span>
                    </div>
                    {doc.file_name && (
                      <p className="text-xs text-gray-400 ml-6 mt-0.5">{doc.file_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{doc.document_type ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {canUpload && (
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={deletingId === doc.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === doc.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />
                          }
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
