'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText,
  Download,
  Trash2,
  Upload,
  Loader2,
  X,
  Pencil,
  Save,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import {
  updateCertificationDetails,
  deleteLicenseDocument,
  linkProgramToCertification,
  unlinkProgramFromCertification,
  getAvailableProgramsForCert,
  getCertificationVersionHistory,
} from '@/app/actions/licenses'
import Modal from './Modal'
import { US_STATES } from '@/lib/constants'

// ── Shared types (mirror what AgencyDetailContent passes down) ──────────────

interface LicenseDocument {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  created_at: string
}

interface LinkedApplication {
  id: string
  link_type: 'created_from' | 'renewal_of'
  linked_at: string
  applications: {
    id: string
    status: string
    application_name: string
    started_date: string | null
  } | null
}

export interface CertLicense {
  id: string
  license_name: string
  license_number?: string | null
  state?: string | null
  status: string
  activated_date?: string | null
  first_issued_date?: string | null
  expiry_date?: string | null
  renewal_due_date?: string | null
  issuing_body?: string | null
  certification_category?: string | null
  previous_version_id?: string | null
  created_at: string
  license_documents?: LicenseDocument[] | null
  certification_applications?: LinkedApplication[] | null
}

type Tab = 'overview' | 'history'

// ── Utilities ────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
}

function formatDateShort(dateStr?: string | null) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch { return '—' }
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  expired:  'bg-red-100 text-red-700',
  expiring: 'bg-orange-100 text-orange-700',
  pending:  'bg-yellow-100 text-yellow-700',
}

const APP_STATUS_COLORS: Record<string, string> = {
  in_progress:  'bg-indigo-100 text-indigo-700',
  under_review: 'bg-blue-100 text-blue-700',
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
  closed:       'bg-gray-100 text-gray-600',
  complete:     'bg-teal-100 text-teal-700',
  requested:    'bg-blue-100 text-blue-700',
}

const DOC_TYPE_OPTIONS = ['license', 'certificate', 'insurance', 'contract', 'policy', 'other'] as const

// ── CertInfo sub-section ────────────────────────────────────────────────────

function CertInfoSection({
  license,
  agencyId,
  canEdit,
  router,
}: {
  license: CertLicense
  agencyId: string
  canEdit: boolean
  router: ReturnType<typeof useRouter>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({
    license_name: license.license_name,
    state: license.state ?? '',
    license_number: license.license_number ?? '',
    activated_date: license.activated_date?.split('T')[0] ?? '',
    expiry_date: license.expiry_date?.split('T')[0] ?? '',
    renewal_due_date: license.renewal_due_date?.split('T')[0] ?? '',
    issuing_body: license.issuing_body ?? '',
    certification_category: license.certification_category ?? '',
    status: license.status,
  })

  // Re-sync form when license prop changes, but only if not mid-edit
  useEffect(() => {
    if (!isEditing) {
      setForm({
        license_name: license.license_name,
        state: license.state ?? '',
        license_number: license.license_number ?? '',
        activated_date: license.activated_date?.split('T')[0] ?? '',
        expiry_date: license.expiry_date?.split('T')[0] ?? '',
        renewal_due_date: license.renewal_due_date?.split('T')[0] ?? '',
        issuing_body: license.issuing_body ?? '',
        certification_category: license.certification_category ?? '',
        status: license.status,
      })
    }
  }, [license, isEditing])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    const { error } = await updateCertificationDetails(license.id, agencyId, {
      license_name: form.license_name,
      state: form.state || null,
      license_number: form.license_number || null,
      activated_date: form.activated_date || null,
      expiry_date: form.expiry_date || null,
      renewal_due_date: form.renewal_due_date || null,
      issuing_body: form.issuing_body || null,
      certification_category: form.certification_category || null,
      status: form.status,
    })
    if (error) {
      setSaveError(error)
    } else {
      setIsEditing(false)
      router.refresh()
    }
    setIsSaving(false)
  }

  const field = (label: string, value: string, field: keyof typeof form, type: 'text' | 'date' | 'select' | 'status' | 'category' = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {isEditing ? (
        type === 'select' ? (
          <select
            value={form[field]}
            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
          >
            <option value="">Federal / N/A</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : type === 'status' ? (
          <select
            value={form[field]}
            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="pending">Pending</option>
          </select>
        ) : type === 'category' ? (
          <select
            value={form[field]}
            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
          >
            <option value="">Select category</option>
            <option value="state_license">State License</option>
            <option value="medicare">Medicare</option>
            <option value="medicaid">Medicaid</option>
            <option value="accreditation">Accreditation</option>
            <option value="bond">Bond</option>
            <option value="insurance">Insurance</option>
            <option value="other">Other</option>
          </select>
        ) : (
          <input
            type={type}
            value={form[field]}
            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        )
      ) : (
        <p className="text-sm text-gray-900 capitalize">{value || '—'}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[license.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {license.status}
          </span>
          {license.certification_category && (
            <span className="text-xs text-gray-400 capitalize">{license.certification_category.replace(/_/g, ' ')}</span>
          )}
        </div>
        {canEdit && !isEditing && (
          <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Pencil className="w-3.5 h-3.5" />Edit
          </button>
        )}
        {isEditing && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        )}
      </div>

      {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{saveError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field('Certification Name', license.license_name, 'license_name')}
        {field('Cert / License #', license.license_number ?? '', 'license_number')}
        {field('State', license.state ?? '', 'state', 'select')}
        {field('Status', license.status, 'status', 'status')}
        {field('Category', license.certification_category ? license.certification_category.replace(/_/g, ' ') : '', 'certification_category', 'category')}
        {field('Issuing Body', license.issuing_body ?? '', 'issuing_body')}
        {field('Issued Date', formatDate(license.activated_date), 'activated_date', 'date')}
        {field('Expiry Date', formatDate(license.expiry_date), 'expiry_date', 'date')}
        {field('Renewal Due', formatDate(license.renewal_due_date), 'renewal_due_date', 'date')}
      </div>
    </div>
  )
}

// ── Documents sub-section ────────────────────────────────────────────────────

function DocumentsSection({
  license,
  agencyId,
  canEdit,
  router,
}: {
  license: CertLicense
  agencyId: string
  canEdit: boolean
  router: ReturnType<typeof useRouter>
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDocName, setUploadDocName] = useState('')
  const [uploadDocType, setUploadDocType] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const docs = [...(license.license_documents ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const handleDownload = async (doc: LicenseDocument) => {
    setDownloadingId(doc.id)
    try {
      const supabase = createClient()
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, doc.document_url)
      if (!signedUrl) throw new Error('Failed to generate URL')
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.document_name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      alert('Failed to download document.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    setDeletingId(docId)
    setDeleteError(null)
    const { error } = await deleteLicenseDocument(docId, agencyId)
    if (error) setDeleteError(error)
    else router.refresh()
    setDeletingId(null)
  }

  const handleUpload = async () => {
    if (!uploadFile) return
    setIsUploading(true)
    setUploadError(null)
    try {
      const supabase = createClient()
      const fileExt = uploadFile.name.split('.').pop()
      const filePath = `license-${license.id}/${Date.now()}.${fileExt}`
      const { error: storageErr } = await supabase.storage
        .from('application-documents')
        .upload(filePath, uploadFile, { upsert: false, contentType: uploadFile.type || `application/${fileExt}` })
      if (storageErr) throw storageErr
      const { error: docErr } = await q.insertLicenseDocument(supabase, {
        license_id: license.id,
        document_name: uploadDocName.trim() || uploadFile.name,
        document_url: filePath,
        document_type: uploadDocType || null,
      })
      if (docErr) {
        await supabase.storage.from('application-documents').remove([filePath])
        throw docErr
      }
      setUploadFile(null)
      setUploadDocName('')
      setUploadDocType('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Documents</h3>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{docs.length}</span>
      </div>

      {deleteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{deleteError}</p>}

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <FileText className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.document_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {doc.document_type && (
                    <span className="text-xs text-gray-400 capitalize">{doc.document_type}</span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Download"
                >
                  {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deletingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="border-t border-gray-200 pt-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload New Document</p>
          {uploadError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{uploadError}</p>}
          {!uploadFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600 font-medium">Click to select a file</p>
              <p className="text-xs text-gray-400 mt-0.5">PDF, DOC, DOCX, JPG, PNG (max 10 MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) { setUploadFile(f); setUploadDocName(f.name) }
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <FileText className="w-7 h-7 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{uploadFile.name}</p>
                  <p className="text-xs text-gray-400">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button type="button" onClick={() => { setUploadFile(null); setUploadDocName('') }} className="p-1.5 hover:bg-gray-200 rounded-lg">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Document name</label>
                  <input
                    type="text"
                    value={uploadDocName}
                    onChange={e => setUploadDocName(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Document type</label>
                  <select
                    value={uploadDocType}
                    onChange={e => setUploadDocType(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white capitalize"
                  >
                    <option value="">Select type</option>
                    {DOC_TYPE_OPTIONS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Programs sub-section ─────────────────────────────────────────────────────

function ProgramsSection({
  license,
  agencyId,
  backPath,
  canEdit,
  router,
}: {
  license: CertLicense
  agencyId: string
  backPath: string
  canEdit: boolean
  router: ReturnType<typeof useRouter>
}) {
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const [unlinkError, setUnlinkError] = useState<string | null>(null)
  const [availablePrograms, setAvailablePrograms] = useState<{ id: string; application_name: string; status: string; started_date: string | null }[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [selectedAppId, setSelectedAppId] = useState('')
  const [linkType, setLinkType] = useState<'created_from' | 'renewal_of'>('created_from')
  const [isLinking, setIsLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const linked = license.certification_applications ?? []
  const isAdminPath = backPath.startsWith('/pages/admin')
  const isAgencyPath = backPath.startsWith('/pages/agency')
  const programBase = isAdminPath ? '/pages/admin/programs' : isAgencyPath ? '/pages/agency/programs' : '/pages/expert/programs'
  const agencyHref = isAgencyPath ? backPath : `${backPath}/${agencyId}`

  useEffect(() => {
    if (!canEdit) return
    setLoadingAvailable(true)
    getAvailableProgramsForCert(license.id, agencyId).then(({ data }) => {
      setAvailablePrograms(data)
      setLoadingAvailable(false)
    })
  }, [license.id, agencyId, canEdit, license.certification_applications])

  const handleUnlink = async (appId: string) => {
    setUnlinkingId(appId)
    setUnlinkError(null)
    const { error } = await unlinkProgramFromCertification(license.id, appId, agencyId)
    if (error) setUnlinkError(error)
    else router.refresh()
    setUnlinkingId(null)
  }

  const handleLink = async () => {
    if (!selectedAppId) return
    setIsLinking(true)
    setLinkError(null)
    const { error } = await linkProgramToCertification(license.id, selectedAppId, agencyId, linkType)
    if (error) setLinkError(error)
    else {
      setSelectedAppId('')
      router.refresh()
    }
    setIsLinking(false)
  }

  const sortedLinked = [...linked].sort((a, b) => new Date(b.linked_at).getTime() - new Date(a.linked_at).getTime())

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Linked Programs</h3>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{linked.length}</span>
      </div>

      {unlinkError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{unlinkError}</p>}

      {sortedLinked.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No programs linked yet.</p>
      ) : (
        <div className="space-y-2">
          {sortedLinked.map(row => {
            const app = row.applications
            if (!app) return null
            const href = `${programBase}/${app.id}?back=${encodeURIComponent(agencyHref)}`
            return (
              <div key={row.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${APP_STATUS_COLORS[app.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {app.status.replace(/_/g, ' ')}
                    </span>
                    <Link href={href} className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                      {app.application_name}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {row.link_type === 'created_from' ? 'Created from this program' : 'Renewal'}
                    {' · '}
                    {formatDate(row.linked_at)}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleUnlink(app.id)}
                    disabled={unlinkingId === app.id}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    title="Unlink"
                  >
                    {unlinkingId === app.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canEdit && (
        <div className="border-t border-gray-200 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Link a Program</p>
          {linkError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{linkError}</p>}
          <div className="flex gap-2">
            <select
              value={selectedAppId}
              onChange={e => setSelectedAppId(e.target.value)}
              disabled={loadingAvailable}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:opacity-50"
            >
              <option value="">{loadingAvailable ? 'Loading…' : availablePrograms.length === 0 ? 'No programs available' : 'Select a program…'}</option>
              {availablePrograms.map(p => (
                <option key={p.id} value={p.id}>{p.application_name}</option>
              ))}
            </select>
            <select
              value={linkType}
              onChange={e => setLinkType(e.target.value as 'created_from' | 'renewal_of')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="created_from">Created from</option>
              <option value="renewal_of">Renewal of</option>
            </select>
            <button
              type="button"
              onClick={handleLink}
              disabled={!selectedAppId || isLinking}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── History tab ──────────────────────────────────────────────────────────────

type PriorVersion = {
  id: string
  license_name: string
  license_number: string | null
  status: string
  activated_date: string | null
  expiry_date: string | null
  previous_version_id: string | null
}

function HistoryTab({
  license,
  agencyId,
}: {
  license: CertLicense
  agencyId: string
}) {
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<PriorVersion[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCertificationVersionHistory(license.id, agencyId).then(({ error: err, data }) => {
      if (err) setError(err)
      else setHistory(data)
      setLoading(false)
    })
  }, [license.id, agencyId])

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Loading history…
    </div>
  )

  if (error) return <p className="text-sm text-red-600 py-4">{error}</p>

  if (history.length === 0) return (
    <div className="py-12 text-center">
      <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
      <p className="text-sm text-gray-500">This is the first version of this certification.</p>
      <p className="text-xs text-gray-400 mt-1">Prior versions will appear here after renewal.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Showing {history.length} prior version{history.length !== 1 ? 's' : ''}.</p>
      {history.map(v => {
        const statusIcon = v.status === 'active'
          ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          : v.status === 'expired'
          ? <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          : <Clock className="w-4 h-4 text-orange-400 shrink-0" />

        return (
          <div key={v.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            {statusIcon}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900">{v.license_number || v.license_name}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[v.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {v.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formatDateShort(v.activated_date)} → {formatDateShort(v.expiry_date)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Root modal ───────────────────────────────────────────────────────────────

interface CertificationDetailModalProps {
  license: CertLicense
  agencyId: string
  backPath: string
  canEdit?: boolean
  onClose: () => void
}

export default function CertificationDetailModal({
  license,
  agencyId,
  backPath,
  canEdit = false,
  onClose,
}: CertificationDetailModalProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabPills = (
    <div className="flex gap-1">
      {(['overview', 'history'] as Tab[]).map(tab => (
        <button
          key={tab}
          type="button"
          onClick={() => setActiveTab(tab)}
          className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors capitalize ${
            activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={license.license_name}
      subtitle={[license.certification_category?.replace(/_/g, ' '), license.state].filter(Boolean).join(' · ') || undefined}
      size="xl"
      headerAccessory={tabPills}
    >
      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <CertInfoSection license={license} agencyId={agencyId} canEdit={canEdit} router={router} />
          <div className="border-t border-gray-200 pt-6">
            <DocumentsSection license={license} agencyId={agencyId} canEdit={canEdit} router={router} />
          </div>
          <div className="border-t border-gray-200 pt-6">
            <ProgramsSection license={license} agencyId={agencyId} backPath={backPath} canEdit={canEdit} router={router} />
          </div>
        </div>
      ) : (
        <HistoryTab license={license} agencyId={agencyId} />
      )}
    </Modal>
  )
}
