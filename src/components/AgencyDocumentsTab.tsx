'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Upload, FileText, Loader2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import { uploadAgencyDocument, deleteAgencyDocumentAction } from '@/app/actions/agencies'
import { deleteLeadDocumentAction } from '@/app/actions/leads'
import * as q from '@/lib/supabase/query'
import { formatDateShort } from '@/lib/format-date'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import TablePagination from '@/components/ui/TablePagination'
import { useTableState } from '@/hooks/useTableState'

interface LeadDoc {
  id: string
  lead_id: string
  document_name: string
  file_url: string
  file_name: string | null
  document_type: string | null
  created_at: string
}

interface AgencyDocumentsTabProps {
  agencyId: string
  leadDocuments: LeadDoc[]
  leadNameMap: Record<string, string>
}

type DocSource = 'agency' | 'lead'

interface UnifiedDoc {
  id: string
  source: DocSource
  lead_id?: string
  document_name: string
  file_url: string
  file_name: string | null
  document_type: string | null
  created_at: string
}

const DOC_TYPES = ['Proposal', 'Contract', 'Agreement', 'Invoice', 'NDA', 'Other']

export default function AgencyDocumentsTab({ agencyId, leadDocuments, leadNameMap }: AgencyDocumentsTabProps) {
  const [agencyDocs, setAgencyDocs] = useState<UnifiedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  const { search, setSearch, sort, setSort, page, setPage, pageSize, applySortedData, applyPageSlice } = useTableState({
    defaultSort: { key: 'date', dir: 'desc' },
  })

  const fetchAgencyDocs = useCallback(async () => {
    const { data } = await q.getAgencyDocuments(supabase, agencyId)
    setAgencyDocs(
      (data ?? []).map((d: any) => ({
        id: d.id,
        source: 'agency' as const,
        document_name: d.document_name,
        file_url: d.file_url,
        file_name: d.file_name,
        document_type: d.document_type,
        created_at: d.created_at,
      }))
    )
    setLoading(false)
  }, [agencyId])

  useEffect(() => { fetchAgencyDocs() }, [fetchAgencyDocs])

  const leadDocs: UnifiedDoc[] = useMemo(
    () => leadDocuments.map(d => ({ ...d, source: 'lead' as const })),
    [leadDocuments]
  )

  const sortFn = useCallback((key: string, dir: 'asc' | 'desc') => (a: UnifiedDoc, b: UnifiedDoc): number => {
    let cmp = 0
    if (key === 'name') cmp = a.document_name.localeCompare(b.document_name)
    else if (key === 'type') cmp = (a.document_type ?? '').localeCompare(b.document_type ?? '')
    else if (key === 'lead') cmp = (a.lead_id ? (leadNameMap[a.lead_id] ?? '') : '').localeCompare(b.lead_id ? (leadNameMap[b.lead_id] ?? '') : '')
    else if (key === 'date') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return dir === 'asc' ? cmp : -cmp
  }, [leadNameMap])

  const filtered = useMemo(() => {
    const combined = [...agencyDocs, ...leadDocs]
    const term = search.toLowerCase()
    if (!term) return combined
    return combined.filter(doc =>
      doc.document_name.toLowerCase().includes(term) ||
      (doc.document_type && doc.document_type.toLowerCase().includes(term)) ||
      (doc.lead_id && (leadNameMap[doc.lead_id] || '').toLowerCase().includes(term))
    )
  }, [agencyDocs, leadDocs, search, leadNameMap])

  const sorted = useMemo(() => applySortedData(filtered, sortFn), [filtered, applySortedData, sortFn])
  const { slice: rows, totalCount } = useMemo(() => applyPageSlice(sorted), [sorted, applyPageSlice])

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

    const result = await uploadAgencyDocument(agencyId, fd)
    setUploading(false)

    if (result.error) { setUploadError(result.error); return }

    const newDoc: UnifiedDoc = {
      id: result.doc!.id,
      source: 'agency',
      document_name: result.doc!.document_name,
      file_url: result.doc!.file_url,
      file_name: selectedFile.name,
      document_type: docType || null,
      created_at: new Date().toISOString(),
    }
    setAgencyDocs(prev => [newDoc, ...prev])
    setDocName('')
    setDocType('')
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowForm(false)
  }

  const handleView = async (doc: UnifiedDoc) => {
    const bucket = doc.source === 'agency' ? STORAGE_BUCKET.AGENCY : STORAGE_BUCKET.LEAD
    const url = await createSignedStorageUrl(supabase, bucket, doc.file_url)
    if (url) window.open(url, '_blank')
  }

  const handleDownload = async (doc: UnifiedDoc) => {
    const bucket = doc.source === 'agency' ? STORAGE_BUCKET.AGENCY : STORAGE_BUCKET.LEAD
    const url = await createSignedStorageUrl(supabase, bucket, doc.file_url)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name ?? doc.document_name
    a.click()
  }

  const handleDelete = async (doc: UnifiedDoc) => {
    if (!confirm(`Delete "${doc.document_name}"?`)) return
    setDeletingId(doc.id)
    let result: { error: string | null }
    if (doc.source === 'lead' && doc.lead_id) {
      result = await deleteLeadDocumentAction(doc.lead_id, doc.id, doc.file_url)
    } else {
      result = await deleteAgencyDocumentAction(agencyId, doc.id, doc.file_url)
    }
    setDeletingId(null)
    if (result.error) { alert(result.error); return }
    if (doc.source === 'agency') {
      setAgencyDocs(prev => prev.filter(d => d.id !== doc.id))
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading documents…</div>
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors sm:ml-auto"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

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
                placeholder="e.g. Agency Agreement"
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
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
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

      {rows.length === 0 ? (
        <div className="py-12 text-center text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">{search ? 'No documents match your search.' : 'No documents yet.'}</p>
          {!search && <p className="text-xs mt-1">Upload agency-level documents above, or add docs from individual leads.</p>}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 px-2 py-2.5" />
                <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
                <SortableColumnHeader label="Type" sortKey="type" currentSort={sort} onSort={setSort} />
                <SortableColumnHeader label="Lead" sortKey="lead" currentSort={sort} onSort={setSort} />
                <SortableColumnHeader label="Date Added" sortKey="date" currentSort={sort} onSort={setSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(doc => (
                <tr key={`${doc.source}-${doc.id}`} className="hover:bg-gray-50/50 transition-colors">
                  <td className="w-10 px-2 py-3">
                    <RecordActionsMenu
                      label={`Actions for ${doc.document_name}`}
                      actions={[
                        { label: 'View Document', onClick: () => handleView(doc) },
                        { label: 'Download', onClick: () => handleDownload(doc) },
                        {
                          label: 'Delete',
                          onClick: () => handleDelete(doc),
                          destructive: true,
                          hidden: deletingId === doc.id,
                        },
                      ]}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{doc.document_name}</span>
                    </div>
                    {doc.file_name && (
                      <p className="text-xs text-gray-400 ml-6 mt-0.5">{doc.file_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {doc.document_type ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {doc.source === 'lead' && doc.lead_id
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{leadNameMap[doc.lead_id] ?? 'Unknown lead'}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatDateShort(doc.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        entityLabel="documents"
      />
    </div>
  )
}
