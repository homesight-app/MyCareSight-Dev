'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import Modal from './Modal'
import UploadDocumentModal from './UploadDocumentModal'
import InternalNotesPanel from './InternalNotesPanel'
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Upload,
  Download,
  FileText,
  Loader2,
  Check,
  Settings,
  Play,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  Trash2,
  CornerDownLeft,
} from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import Tabs from '@/components/ui/Tabs'
import {
  getProgramItemDocuments,
  getProgramItemRuleChecks,
  getAgencyFieldValues,
  updateProgramItem,
  addApplicationItemRule,
  removeApplicationItemRule,
  runDocumentValidation,
  saveValidationRun,
  getValidationHistory,
  getValidationRuleLibrary,
  deleteApplicationDocument,
  sendBackProgramItem,
  submitProgramItem,
  getLatestValidationSummary,
  type DraftValidationResult,
} from '@/app/actions/playbooks'
import type { ApplicationPlaybookItem, ApplicationRuleCheck, ValidationRun, ValidationRule } from '@/lib/supabase/query/playbooks'

interface AgencyFields {
  legal_entity_name: string | null
  name: string | null
  dba_name: string | null
  licensed_office_street: string | null
  licensed_office_city: string | null
  licensed_office_state: string | null
  licensed_office_zip: string | null
  physical_street_address: string | null
  physical_city: string | null
  physical_state: string | null
  physical_zip_code: string | null
  mailing_street_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip_code: string | null
}

const addr = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(', ') || '—'

const FIELD_VALUES: Record<string, (a: AgencyFields) => string> = {
  legal_entity_name:  a => a.legal_entity_name ?? '—',
  agency_name:        a => a.dba_name ?? a.name ?? '—',
  dba_name:           a => a.dba_name ?? a.name ?? '—',
  operating_name:     a => a.dba_name ?? a.name ?? '—',
  state:              a => a.licensed_office_state ?? '—',
  operating_state:    a => a.licensed_office_state ?? '—',
  office_address:     a => addr(a.licensed_office_street, a.licensed_office_city, a.licensed_office_state, a.licensed_office_zip),
  office_street:      a => a.licensed_office_street ?? '—',
  office_city:        a => a.licensed_office_city ?? '—',
  office_state:       a => a.licensed_office_state ?? '—',
  office_zip:         a => a.licensed_office_zip ?? '—',
  corporate_address:  a => addr(a.physical_street_address, a.physical_city, a.physical_state, a.physical_zip_code),
  mailing_address:    a => addr(a.mailing_street_address, a.mailing_city, a.mailing_state, a.mailing_zip_code),
}

const STATUS_LABELS: Record<string, string> = {
  not_started:   'Not Started',
  in_progress:   'In Progress',
  review_needed: 'Review Needed',
  approved:      'Approved',
}

const STATUS_COLORS: Record<string, string> = {
  not_started:    'bg-gray-100 text-gray-600',
  in_progress:    'bg-blue-100 text-blue-700',
  review_needed:  'bg-amber-100 text-amber-700',
  approved:       'bg-green-100 text-green-700',
}

type ItemDoc = {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string | null
  description: string | null
  expert_review_notes: string | null
  created_at: string
}

type DraftResult = DraftValidationResult & {
  checkedOverride: boolean
  foundText: string
  notesOverride: string
}

type RunPhase = 'idle' | 'extracting' | 'review'

export type TabId = 'overview' | 'documents' | 'validation' | 'notes' | 'history'

interface Props {
  item: ApplicationPlaybookItem
  agencyId: string | null
  isStaff: boolean
  onClose: () => void
  onItemUpdated: (updated: ApplicationPlaybookItem) => void
  defaultTab?: TabId
  /** Render content inline (no modal overlay) — used when opening from the Documents tab */
  inline?: boolean
  /** Called when the back button is clicked in inline mode */
  onBack?: () => void
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
}

// ── DOCX viewer sub-component ─────────────────────────────────────────────────
function DocxViewerPane({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      if (!containerRef.current) return
      setStatus('loading')
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error('fetch failed')
        const buf = await res.arrayBuffer()
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''
        const { renderAsync } = await import('docx-preview')
        await renderAsync(buf, containerRef.current, undefined, {
          className: 'docx-preview',
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
          trimXmlDeclaration: true,
        })
        if (!cancelled) setStatus('done')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    render()
    return () => { cancelled = true }
  }, [url])

  return (
    <div className="absolute inset-0 overflow-auto bg-gray-100">
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-100">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-sm text-gray-500">Rendering document…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500">
          Failed to render document — try downloading it instead.
        </div>
      )}
      <div
        ref={containerRef}
        className={`p-4 ${status !== 'done' ? 'invisible' : ''}`}
        style={{ minWidth: 'max-content' }}
      />
    </div>
  )
}

export default function ProgramItemDetailModal({ item, agencyId, isStaff, onClose, onItemUpdated, defaultTab, inline, onBack, size = '2xl' }: Props) {
  const isDocument = item.item_type === 'document'
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab ?? 'overview')
  const [documents, setDocuments] = useState<ItemDoc[]>([])
  const [ruleChecks, setRuleChecks] = useState<ApplicationRuleCheck[]>([])
  const [agencyData, setAgencyData] = useState<AgencyFields | null>(null)
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)
  const [isLoadingRules, setIsLoadingRules] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<ApplicationPlaybookItem['status']>(item.status)
  const [isSaving, setIsSaving] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null)

  // Rule management
  const [isManageRulesOpen, setIsManageRulesOpen] = useState(false)
  const [ruleLibrary, setRuleLibrary] = useState<ValidationRule[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  const [togglingLibraryRuleId, setTogglingLibraryRuleId] = useState<string | null>(null)

  // Validation run
  const [runPhase, setRunPhase] = useState<RunPhase>('idle')
  const [isSavingRun, setIsSavingRun] = useState(false)
  const [draftResults, setDraftResults] = useState<DraftResult[]>([])
  const [currentExtractionStatus, setCurrentExtractionStatus] = useState<string>('success')
  const [showRunConfirm, setShowRunConfirm] = useState(false)

  // Document preview (used in review pane)
  type PreviewDoc = { url: string; name: string; ext: string }
  const [previewDocs, setPreviewDocs] = useState<PreviewDoc[]>([])
  const [previewIdx, setPreviewIdx] = useState(0)
  const supabase = createClient()

  // History
  const [validationRuns, setValidationRuns] = useState<ValidationRun[]>([])
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [draftFilter, setDraftFilter] = useState<'all' | 'passed' | 'issues'>('all')

  // Client-side (non-staff) validation summary — only the latest run's counts
  const [clientSummary, setClientSummary] = useState<{ passed: number; failed: number } | null>(null)

  // Send Back
  const [showSendBack, setShowSendBack] = useState(false)
  const [sendBackNote, setSendBackNote] = useState('')
  const [isSendingBack, setIsSendingBack] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Document delete
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

  const loadDocs = useCallback(async () => {
    if (!isDocument) return
    setIsLoadingDocs(true)
    const { documents: docs } = await getProgramItemDocuments(item.id)
    setDocuments(docs)
    setIsLoadingDocs(false)
  }, [item.id, isDocument])

  const loadRules = useCallback(async () => {
    if (!isDocument) return
    setIsLoadingRules(true)
    const { checks } = await getProgramItemRuleChecks(item.id)
    setRuleChecks(checks)
    setIsLoadingRules(false)
  }, [item.id, isDocument])

  const loadHistory = useCallback(async () => {
    if (!isDocument) return
    const { runs } = await getValidationHistory(item.id)
    setValidationRuns(runs ?? [])
  }, [item.id, isDocument])

  useEffect(() => {
    loadDocs()
    if (isStaff) {
      loadRules()
      loadHistory()
    } else if (isDocument) {
      getLatestValidationSummary(item.id).then(setClientSummary)
    }
    if (agencyId) {
      getAgencyFieldValues(agencyId).then(({ agency }) => {
        if (agency) setAgencyData(agency as AgencyFields)
      })
    }
  }, [loadDocs, loadRules, loadHistory, agencyId, isStaff, isDocument, item.id])

  const openManageRules = async () => {
    setIsManageRulesOpen(true)
    if (ruleLibrary.length === 0) {
      setIsLoadingLibrary(true)
      const { rules } = await getValidationRuleLibrary()
      setRuleLibrary(rules)
      setIsLoadingLibrary(false)
    }
  }

  const handleAddRule = async (rule: ValidationRule) => {
    setTogglingLibraryRuleId(rule.id)
    const { check } = await addApplicationItemRule(item.id, rule.id)
    if (check) setRuleChecks(prev => [...prev, check])
    setTogglingLibraryRuleId(null)
  }

  const handleRemoveRule = async (rule: ValidationRule) => {
    const existing = ruleChecks.find(c => c.validation_rule_id === rule.id)
    if (!existing) return
    setTogglingLibraryRuleId(rule.id)
    await removeApplicationItemRule(existing.id)
    setRuleChecks(prev => prev.filter(c => c.id !== existing.id))
    setTogglingLibraryRuleId(null)
  }

  const startRun = async () => {
    setShowRunConfirm(false)
    setDraftFilter('all')
    setRunPhase('extracting')
    const result = await runDocumentValidation(item.id, agencyId)
    if (result.error) {
      setRunPhase('idle')
      return
    }
    setCurrentExtractionStatus(result.extractionStatus)
    setDraftResults(result.draftResults.map(r => ({
      ...r,
      checkedOverride: r.suggestedChecked,
      foundText: r.foundText ?? '',
      notesOverride: '',
    })))

    // Generate signed URLs for all uploaded documents so they can be previewed
    const previews: PreviewDoc[] = []
    for (const doc of documents) {
      const ext = doc.document_name.split('.').pop()?.toLowerCase() ?? ''
      let url = doc.document_url
      if (url && !url.startsWith('http')) {
        const signed = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, url, 3600)
        url = signed ?? ''
      }
      if (url) previews.push({ url, name: doc.document_name, ext })
    }
    setPreviewDocs(previews)
    setPreviewIdx(0)
    setRunPhase('review')
  }

  const handleRunValidation = () => {
    if (validationRuns.length > 0) {
      setShowRunConfirm(true)
    } else {
      startRun()
    }
  }

  const handleSaveRun = async () => {
    setIsSavingRun(true)
    const nextRunNumber = validationRuns.length + 1
    const confirmedResults = draftResults.map(r => ({
      ruleCheckId: r.ruleCheckId,
      isChecked: r.checkedOverride,
      notes: r.notesOverride.trim() || null,
      autoResult: r.autoResult,
      matchSnippet: r.matchSnippet,
      foundText: r.foundText.trim() || null,
      ruleName: r.ruleName,
      fieldKey: r.fieldKey,
      expectedValue: r.expectedValue,
    }))
    const { error } = await saveValidationRun(item.id, nextRunNumber, confirmedResults, currentExtractionStatus)
    setIsSavingRun(false)
    if (!error) {
      await loadRules()
      await loadHistory()
      setRunPhase('idle')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    const { error } = await updateProgramItem(item.id, { status: pendingStatus })
    setIsSaving(false)
    if (!error) onItemUpdated({ ...item, status: pendingStatus })
  }

  const handleApprove = async () => {
    setIsApproving(true)
    const { error } = await updateProgramItem(item.id, { status: 'approved' })
    setIsApproving(false)
    if (!error) {
      setPendingStatus('approved')
      onItemUpdated({ ...item, status: 'approved' })
    }
  }

  const handleDeleteDoc = async (doc: ItemDoc) => {
    if (!confirm(`Delete "${doc.document_name}"? This cannot be undone.`)) return
    setDeletingDocId(doc.id)
    const { error } = await deleteApplicationDocument(doc.id)
    setDeletingDocId(null)
    if (!error) loadDocs()
  }

  // Client-facing computed permissions
  const canReplace = !isStaff && isDocument &&
    (item.status === 'not_started' || item.status === 'review_needed') &&
    (item.assignment === 'client' || item.assignment === 'both')

  const clientCanSubmit = !isStaff &&
    (item.status === 'not_started' || item.status === 'review_needed') &&
    (item.assignment === 'client' || item.assignment === 'both')

  const handleClientSubmit = async () => {
    setIsSubmitting(true)
    const { error } = await submitProgramItem(item.id)
    setIsSubmitting(false)
    if (!error) onItemUpdated({ ...item, status: 'in_progress' })
  }

  const generateSendBackMessage = (): string => {
    if (!isDocument) {
      return 'This step requires revision. Please review the feedback below and resubmit when complete.'
    }
    if (!latestRun || latestRun.results.length === 0) {
      return 'There were issues found with the uploaded document. Please review, replace it with a corrected version, and resubmit.'
    }

    const passedResults = latestRun.results.filter(r => r.is_checked)
    const failedResults = latestRun.results.filter(r => !r.is_checked && r.auto_result === 'not_found')
    const unreadResults = latestRun.results.filter(r => !r.is_checked && r.auto_result === 'extraction_failed')

    const lines: string[] = ['There were issues found with the uploaded document.\n']

    if (passedResults.length > 0) {
      lines.push(`✓ Passed (${passedResults.length}):`)
      passedResults.forEach(r => lines.push(`  • ${r.rule_name}`))
      lines.push('')
    }

    if (failedResults.length > 0) {
      lines.push(`✗ Not Found (${failedResults.length}):`)
      failedResults.forEach(r => lines.push(`  • ${r.rule_name}`))
      lines.push('')
    }

    if (unreadResults.length > 0) {
      lines.push(`? Could Not Read (${unreadResults.length}):`)
      unreadResults.forEach(r => lines.push(`  • ${r.rule_name}`))
      lines.push('')
    }

    lines.push('Please review, replace the document with a corrected version, and resubmit.')

    return lines.join('\n')
  }

  const handleSendBack = async () => {
    if (!sendBackNote.trim()) return
    setIsSendingBack(true)
    const { error } = await sendBackProgramItem(item.id, sendBackNote.trim())
    setIsSendingBack(false)
    if (!error) {
      setShowSendBack(false)
      setSendBackNote('')
      onItemUpdated({ ...item, status: 'review_needed', notes: sendBackNote.trim() })
      onClose()
    }
  }

  const handleDownload = async (doc: ItemDoc) => {
    setDownloadingDocId(doc.id)
    const supabase = createClient()
    const url = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, doc.document_url)
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = doc.document_name
      a.click()
    }
    setDownloadingDocId(null)
  }

  // Validation summary counts — derived from the latest saved run, not ruleChecks.
  // ruleChecks.is_checked is a static template field, not a run result, so using it
  // would show "issues" before any run has been performed.
  const latestRun = validationRuns[0] ?? null
  const passed    = latestRun?.passed_count ?? 0
  const issues    = latestRun?.failed_count ?? 0

  const tabs: { id: TabId; label: string; badge?: number }[] = isDocument
    ? [
        { id: 'overview',    label: 'Overview' },
        { id: 'documents',   label: 'Documents',  badge: documents.length },
        ...(isStaff ? [{ id: 'validation' as TabId, label: 'Validation', badge: issues > 0 ? issues : undefined }] : []),
        { id: 'notes',       label: 'Notes' },
        { id: 'history',     label: 'History' },
      ]
    : [
        { id: 'overview', label: 'Overview' },
        { id: 'notes',    label: 'Notes' },
        { id: 'history',  label: 'History' },
      ]

  const header = (
    <div className="flex items-center justify-between gap-4 pt-2">
      {/* Status selector */}
      <div className="flex items-center gap-2">
        <select
          value={pendingStatus}
          onChange={e => setPendingStatus(e.target.value as ApplicationPlaybookItem['status'])}
          disabled={!isStaff}
          className={`text-sm font-medium rounded-lg px-3 py-1.5 border focus:outline-none ${STATUS_COLORS[pendingStatus]} border-current/20`}
        >
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {isStaff && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.status === 'in_progress' && !showSendBack && (
            <button
              onClick={() => { setShowSendBack(true); setSendBackNote(generateSendBackMessage()) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 border border-amber-300 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
              Send Back
            </button>
          )}
          <Button
            variant="secondary"
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || pendingStatus === item.status}
            loading={isSaving}
          >
            Save
          </Button>
          {pendingStatus !== 'approved' && (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Mark as Approved
            </button>
          )}
        </div>
      )}

      {!isStaff && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.status === 'in_progress' ? (
            <span className="flex items-center gap-1.5 text-sm text-blue-600 font-medium">
              <Loader2 className="w-3.5 h-3.5" />
              Submitted — awaiting expert review
            </span>
          ) : clientCanSubmit && (
            <Button
              variant="primary"
              type="button"
              size="sm"
              onClick={handleClientSubmit}
              disabled={isSubmitting || (isDocument && documents.length === 0)}
              loading={isSubmitting}
              icon={Check}
            >
              {item.status === 'review_needed' ? 'Resubmit for Review' : 'Submit for Review'}
            </Button>
          )}
        </div>
      )}
    </div>
  )

  const body = (
    <>
        {/* Tabs */}
        <div className="-mx-6 px-6 mb-6">
          <Tabs
            variant="underline"
            active={activeTab}
            onChange={(k) => setActiveTab(k as TabId)}
            items={tabs.map(t => ({ key: t.id, label: t.label, count: t.badge }))}
          />
        </div>

        {/* ── Send Back form ── */}
        {showSendBack && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">Send Back to Client</p>
            <textarea
              value={sendBackNote}
              onChange={e => setSendBackNote(e.target.value)}
              placeholder="Describe what the client needs to fix or provide…"
              rows={8}
              className="w-full text-sm border border-amber-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y font-mono"
            />
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowSendBack(false); setSendBackNote('') }} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button
                onClick={handleSendBack}
                disabled={isSendingBack || !sendBackNote.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSendingBack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
                Confirm Send Back
              </button>
            </div>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className={isDocument ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'max-w-2xl'}>
            {/* Left: Requirement Details */}
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Requirement Details</h3>
                <div>
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">{item.item_type}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Requirement</p>
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${item.requirement_type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {item.requirement_type === 'required' ? 'Required' : 'Optional'}
                  </span>
                </div>
                {item.description && (
                  <div>
                    <p className="text-xs text-gray-500">Description</p>
                    <p className="text-sm text-gray-700">{item.description}</p>
                  </div>
                )}
                {item.instructions && (
                  <div>
                    <p className="text-xs text-gray-500">Instructions</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.instructions}</p>
                  </div>
                )}
                {item.due_date && (
                  <div>
                    <p className="text-xs text-gray-500">Due Date</p>
                    <p className="text-sm font-medium text-gray-900">{new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Assigned To</h3>
                <p className="text-sm text-gray-700 capitalize">{item.assignment === 'both' ? 'Client & Expert' : item.assignment}</p>
              </div>

              {!isDocument && item.instructions && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Instructions</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.instructions}</p>
                </div>
              )}
            </div>

            {/* Right: Documents + Validation Summary (document items only) */}
            {isDocument && (
              <div className="space-y-4">
                {/* Documents */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Documents</h3>
                    {(isStaff || canReplace) && (
                      <button
                        onClick={() => setIsUploadOpen(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {canReplace && documents.length > 0 ? 'Replace Document' : 'Upload Document'}
                      </button>
                    )}
                  </div>
                  {isLoadingDocs ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                  ) : documents.length === 0 ? (
                    <p className="text-sm text-gray-400 italic py-4 text-center">No documents uploaded yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                          <th className="text-left py-2 pr-3">Name</th>
                          <th className="text-left py-2 pr-3">Type</th>
                          <th className="text-left py-2">Date</th>
                          <th className="w-16" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {documents.slice(0, 3).map(doc => (
                          <tr key={doc.id}>
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <span className="truncate max-w-[140px] text-gray-800">{doc.document_name}</span>
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-gray-500 capitalize text-xs">{doc.document_type ?? '—'}</td>
                            <td className="py-2 text-gray-500 text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                            <td className="py-2">
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => handleDownload(doc)}
                                  disabled={downloadingDocId === doc.id}
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  title="Download"
                                >
                                  {downloadingDocId === doc.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                                    : <Download className="w-3.5 h-3.5 text-gray-400" />
                                  }
                                </button>
                                {isStaff && (
                                  <button
                                    onClick={() => handleDeleteDoc(doc)}
                                    disabled={deletingDocId === doc.id}
                                    className="p-1 hover:bg-red-50 rounded transition-colors"
                                    title="Delete"
                                  >
                                    {deletingDocId === doc.id
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                                      : <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                                    }
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {documents.length > 3 && (
                    <button onClick={() => setActiveTab('documents')} className="mt-2 text-xs text-blue-600 hover:underline">
                      View all {documents.length} documents →
                    </button>
                  )}
                </div>

                {/* Revision callout */}
                {item.status === 'review_needed' && item.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-amber-800 mb-1">Revision Needed</p>
                    <p className="text-sm text-amber-700">{item.notes}</p>
                  </div>
                )}

                {/* Validation Summary — staff: show after first run; client: show if latest run exists */}
                {(() => {
                  const summary = isStaff
                    ? (validationRuns.length > 0 ? { passed, failed: issues } : null)
                    : clientSummary
                  if (!summary && !isLoadingRules) return null
                  return (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Validation Summary</h3>
                      {isLoadingRules && isStaff ? (
                        <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                      ) : summary ? (
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1.5 text-sm text-green-700">
                            <CheckCircle2 className="w-4 h-4" /> Passed <strong>{summary.passed}</strong>
                          </span>
                          {summary.failed > 0 && (
                            <span className="flex items-center gap-1.5 text-sm text-red-600">
                              <AlertCircle className="w-4 h-4" /> Failed <strong>{summary.failed}</strong>
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {activeTab === 'documents' && isDocument && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{documents.length} document{documents.length !== 1 ? 's' : ''} uploaded</p>
              {(isStaff || canReplace) && (
                <Button
                  variant="primary"
                  type="button"
                  icon={Upload}
                  onClick={() => setIsUploadOpen(true)}
                >
                  {canReplace && documents.length > 0 ? 'Replace Document' : 'Upload Document'}
                </Button>
              )}
            </div>

            {isLoadingDocs ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No documents uploaded for this requirement yet.</p>
                {(isStaff || canReplace) && (
                  <button onClick={() => setIsUploadOpen(true)} className="mt-3 text-sm text-blue-600 hover:underline">
                    Upload the first document
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Document Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {documents.map(doc => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="font-medium text-gray-900">{doc.document_name}</span>
                          </div>
                          {doc.description && <p className="text-xs text-gray-400 mt-0.5 ml-6">{doc.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{doc.document_type ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            doc.status === 'approved' ? 'bg-green-100 text-green-700' :
                            doc.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {doc.status ?? 'draft'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleDownload(doc)}
                              disabled={downloadingDocId === doc.id}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Download"
                            >
                              {downloadingDocId === doc.id
                                ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                : <Download className="w-4 h-4 text-gray-400" />
                              }
                            </button>
                            {isStaff && (
                              <button
                                onClick={() => handleDeleteDoc(doc)}
                                disabled={deletingDocId === doc.id}
                                className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                {deletingDocId === doc.id
                                  ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                  : <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
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
        )}

        {/* ── VALIDATION ── */}
        {activeTab === 'validation' && isDocument && (
          <div className="space-y-4">

            {/* ── Loading state ── */}
            {runPhase === 'extracting' && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-600 font-medium">Extracting document text…</p>
                <p className="text-xs text-gray-400">Reading uploaded documents and checking rules</p>
              </div>
            )}

            {/* ── Draft results review — split pane ── */}
            {runPhase === 'review' && (
              <div className="flex gap-4 h-[68vh] -mx-6 px-6">

                {/* ── Left: Document viewer ── */}
                <div className="flex-1 min-w-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden">
                  {/* Doc switcher when multiple */}
                  {previewDocs.length > 1 && (
                    <div className="flex gap-1 p-2 bg-gray-50 border-b border-gray-200 overflow-x-auto flex-shrink-0">
                      {previewDocs.map((d, i) => (
                        <button
                          key={i}
                          onClick={() => setPreviewIdx(i)}
                          className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
                            previewIdx === i ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Viewer */}
                  <div className="flex-1 min-h-0 relative bg-gray-100">
                    {previewDocs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                        <FileText className="w-10 h-10" />
                        <p className="text-sm">No documents uploaded</p>
                      </div>
                    ) : (() => {
                      const doc = previewDocs[previewIdx]
                      const isPdf   = doc.ext === 'pdf'
                      const isImage = ['jpg','jpeg','png','gif','webp','svg'].includes(doc.ext)
                      const isDocx  = ['docx','doc'].includes(doc.ext)
                      if (isPdf) {
                        return (
                          <iframe
                            src={doc.url}
                            title={doc.name}
                            className="w-full h-full border-0"
                          />
                        )
                      }
                      if (isImage) {
                        return (
                          <div className="flex items-center justify-center h-full p-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={doc.url} alt={doc.name} className="max-w-full max-h-full object-contain rounded shadow" />
                          </div>
                        )
                      }
                      if (isDocx) {
                        return <DocxViewerPane key={doc.url} url={doc.url} />
                      }
                      return (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 p-6">
                          <FileText className="w-10 h-10 text-gray-300" />
                          <p className="text-sm font-medium">{doc.name}</p>
                          <p className="text-xs text-gray-400">Preview not available for .{doc.ext} files</p>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
                          >
                            <Download className="w-4 h-4" /> Download to view
                          </a>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* ── Right: Validation results ── */}
                <div className="w-[420px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
                  {/* Extraction status */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0 ${
                    currentExtractionStatus === 'success'     ? 'bg-green-50 text-green-700' :
                    currentExtractionStatus === 'partial'     ? 'bg-amber-50 text-amber-700' :
                    currentExtractionStatus === 'no_document' ? 'bg-blue-50 text-blue-700' :
                    'bg-red-50 text-red-700'
                  }`}>
                    {currentExtractionStatus === 'success'     ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> :
                     <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span>
                      {currentExtractionStatus === 'success'     ? 'Text extracted — review and adjust results.' :
                       currentExtractionStatus === 'partial'     ? 'Some docs unreadable — check results manually.' :
                       currentExtractionStatus === 'no_document' ? 'No document — enter findings manually.' :
                       'Extraction failed — enter findings manually.'}
                    </span>
                  </div>

                  {/* Filter tabs */}
                  {draftResults.length > 0 && (() => {
                    const passedCount = draftResults.filter(r => r.checkedOverride).length
                    const issueCount  = draftResults.filter(r => !r.checkedOverride).length
                    return (
                      <div className="flex items-center gap-1 border-b border-gray-200 flex-shrink-0">
                        {([['all', `All (${draftResults.length})`], ['passed', `Passed (${passedCount})`], ['issues', `Issues (${issueCount})`]] as const).map(([f, label]) => (
                          <button
                            key={f}
                            onClick={() => setDraftFilter(f)}
                            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${draftFilter === f ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Rule cards */}
                  {draftResults.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-400">No rules configured.</div>
                  ) : (
                    <div className="space-y-2">
                      {draftResults
                        .filter(r =>
                          draftFilter === 'all' ? true :
                          draftFilter === 'passed' ? r.checkedOverride :
                          !r.checkedOverride
                        )
                        .map(r => {
                          const globalIdx = draftResults.indexOf(r)
                          return (
                            <div
                              key={r.ruleCheckId}
                              className={`rounded-xl border p-3 space-y-2 transition-colors ${r.checkedOverride ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-gray-800 leading-tight">{r.ruleName}</p>
                                <button
                                  onClick={() => setDraftResults(prev => prev.map((d, i) => i === globalIdx ? { ...d, checkedOverride: !d.checkedOverride } : d))}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border flex-shrink-0 transition-colors ${
                                    r.checkedOverride
                                      ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                                      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                  }`}
                                >
                                  {r.checkedOverride
                                    ? <><CheckCircle2 className="w-3 h-3" /> Pass</>
                                    : <><AlertCircle className="w-3 h-3" /> Fail</>}
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-400 block mb-0.5">Expected</span>
                                  <span className="text-gray-700 font-medium">{r.expectedValue || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block mb-0.5">Auto result</span>
                                  <span className={`font-medium ${
                                    r.autoResult === 'found' ? 'text-green-700' :
                                    r.autoResult === 'not_found' ? 'text-amber-700' : 'text-gray-500'
                                  }`}>
                                    {r.autoResult === 'found' ? 'Matched' : r.autoResult === 'not_found' ? 'Not found' : 'Manual'}
                                  </span>
                                </div>
                              </div>
                              <div>
                                <span className="text-xs text-gray-400 block mb-0.5">Found text</span>
                                <input
                                  type="text"
                                  value={r.foundText}
                                  onChange={e => setDraftResults(prev => prev.map((d, i) => i === globalIdx ? { ...d, foundText: e.target.value } : d))}
                                  placeholder="Enter what you found in the document…"
                                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
                                />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}

                  {/* Actions pinned to bottom */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-auto flex-shrink-0">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setRunPhase('idle')}
                      disabled={isSavingRun}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      type="button"
                      onClick={handleSaveRun}
                      disabled={isSavingRun}
                      loading={isSavingRun}
                      icon={Check}
                    >
                      Save Run #{validationRuns.length + 1}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Normal idle view ── */}
            {runPhase === 'idle' && (
              <>
                {/* Action bar */}
                {isStaff && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    {/* <div className="flex items-center gap-4 text-sm">
                      {!isLoadingRules && ruleChecks.length > 0 && (
                        <>
                          <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Passed <strong>{passed}</strong></span>
                          <span className="flex items-center gap-1 text-red-600"><AlertCircle className="w-3.5 h-3.5" /> Issues <strong>{issues}</strong></span>
                          {warnings > 0 && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> Warnings <strong>{warnings}</strong></span>}
                        </>
                      )}
                    </div> */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => isManageRulesOpen ? setIsManageRulesOpen(false) : openManageRules()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        {isManageRulesOpen ? 'Done' : 'Manage Rules'}
                      </button>
                      <div className="relative" title={documents.length === 0 ? 'Upload a document first' : undefined}>
                        <button
                          onClick={handleRunValidation}
                          disabled={isLoadingDocs || isLoadingRules || documents.length === 0 || ruleChecks.length === 0}
                          title={documents.length === 0 ? 'Upload a document first' : ruleChecks.length === 0 ? 'Add validation rules first' : undefined}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          {validationRuns.length > 0 ? 'New Run' : 'Run Validation'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Run confirm dialog */}
                {showRunConfirm && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                    <p className="text-sm font-semibold text-amber-900">Start Run #{validationRuns.length + 1}?</p>
                    <p className="text-xs text-amber-700">
                      This will reset the current rule check state and extract fresh results from your documents.
                      Run #{validationRuns.length} will be preserved in history.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={startRun}
                        className="px-4 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                      >
                        Yes, start new run
                      </button>
                      <button
                        onClick={() => setShowRunConfirm(false)}
                        className="px-4 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Manage Rules panel */}
                {isManageRulesOpen && isStaff && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Validation Rule Library</p>
                    </div>
                    {isLoadingLibrary ? (
                      <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading rules…
                      </div>
                    ) : ruleLibrary.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No validation rules found in library.</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {ruleLibrary.map(rule => {
                          const isAdded = ruleChecks.some(c => c.validation_rule_id === rule.id)
                          const isToggling = togglingLibraryRuleId === rule.id
                          return (
                            <div key={rule.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800">{rule.name}</p>
                                {rule.description && <p className="text-xs text-gray-400 truncate">{rule.description}</p>}
                              </div>
                              <button
                                onClick={() => isAdded ? handleRemoveRule(rule) : handleAddRule(rule)}
                                disabled={isToggling}
                                className={`flex-shrink-0 ml-3 inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 ${
                                  isAdded
                                    ? 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-200'
                                    : 'text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200'
                                }`}
                              >
                                {isToggling ? <Loader2 className="w-3 h-3 animate-spin" /> :
                                 isAdded ? <><X className="w-3 h-3" /> Remove</> :
                                 <><Plus className="w-3 h-3" /> Add</>}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Rule checks list */}
                {isLoadingRules ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading rules…
                  </div>
                ) : ruleChecks.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                    <p className="text-sm text-gray-500">No validation rules are assigned to this requirement.</p>
                    {isStaff && (
                      <button onClick={openManageRules} className="mt-2 text-xs text-blue-600 hover:underline">
                        Add rules from library →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ruleChecks.map(check => {
                      const liveValue = agencyData ? (FIELD_VALUES[check.field_key]?.(agencyData) ?? '—') : '…'
                      return (
                        <div
                          key={check.id}
                          className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                            check.is_checked ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium ${check.is_checked ? 'text-green-800' : 'text-gray-800'}`}>
                                {check.rule_name}
                              </p>
                            </div>
                            {check.description && (
                              <p className="text-xs text-gray-500 mt-0.5">{check.description}</p>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-gray-400">Agency record:</span>
                              <span className="text-xs font-medium text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                                {liveValue}
                              </span>
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {check.is_checked
                              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                              : <AlertCircle className="w-4 h-4 text-red-400" />
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Previous Runs accordion */}
                {validationRuns.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Previous Runs</h4>
                    {validationRuns.map(run => (
                      <div key={run.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            {expandedRunId === run.id
                              ? <ChevronDown className="w-4 h-4 text-gray-400" />
                              : <ChevronRight className="w-4 h-4 text-gray-400" />
                            }
                            <span className="text-sm font-medium text-gray-800">Run #{run.run_number}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(run.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-green-700 font-medium">✓ {run.passed_count}</span>
                            {run.failed_count > 0 && <span className="text-red-600 font-medium">✗ {run.failed_count}</span>}
                          </div>
                        </button>
                        {expandedRunId === run.id && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Rule Name</th>
                                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Expected</th>
                                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Found</th>
                                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Result</th>
                                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(run.results ?? []).map((r, i) => (
                                  <tr key={i} className={r.is_checked ? 'bg-green-50' : ''}>
                                    <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{r.rule_name}</td>
                                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[120px]">
                                      <span className="block truncate" title={r.expected_value}>{r.expected_value}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[140px]">
                                      <span className="block truncate" title={r.found_text ?? r.match_snippet ?? '—'}>
                                        {r.found_text || r.match_snippet || '—'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                        r.auto_result === 'found'     ? 'bg-green-100 text-green-700' :
                                        r.auto_result === 'not_found' ? 'bg-amber-100 text-amber-700' :
                                        'bg-gray-100 text-gray-500'
                                      }`}>
                                        {r.auto_result === 'found' ? 'Matches' : r.auto_result === 'not_found' ? 'Not Found' : 'Manual'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${
                                        r.is_checked ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
                                      }`}>
                                        {r.is_checked ? <><CheckCircle2 className="w-3 h-3" /> Pass</> : <><AlertCircle className="w-3 h-3" /> Fail</>}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── NOTES ── */}
        {activeTab === 'notes' && agencyId && (
          <InternalNotesPanel
            subjectType="application_playbook_item"
            subjectId={item.id}
            agencyId={agencyId}
            canManage={isStaff}
          />
        )}
        {activeTab === 'notes' && !agencyId && (
          <p className="text-sm text-gray-400 py-8 text-center">Notes are not available for this item.</p>
        )}

        {/* ── HISTORY ── */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-700">Item created</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </div>

            {item.updated_at && item.updated_at !== item.created_at && (
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Last updated · <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(item.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              </div>
            )}

            {item.approved_at && (
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">Approved</p>
                  <p className="text-xs text-green-600 mt-0.5">{new Date(item.approved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              </div>
            )}
          </div>
        )}
    </>
  )

  const nestedModals = (
    <>
      {isUploadOpen && (
        <UploadDocumentModal
          isOpen
          onClose={() => setIsUploadOpen(false)}
          applicationId={item.application_id}
          applicationPlaybookItemId={item.id}
          onSuccess={async () => {
            setIsUploadOpen(false)
            if (canReplace && documents.length > 0) {
              await Promise.all(documents.map(d => deleteApplicationDocument(d.id)))
            }
            loadDocs()
          }}
        />
      )}
    </>
  )

  if (inline) {
    return (
      <>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-xl">
            <div className="px-6 pt-5 pb-4">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Documents
              </button>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">{item.name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Document · {item.requirement_type === 'required' ? 'Required' : 'Optional'}
                  </p>
                </div>
              </div>
              <div className="mt-4">{header}</div>
            </div>
          </div>
          <div className="p-6">{body}</div>
        </div>
        {nestedModals}
      </>
    )
  }

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={item.name}
        subtitle={`${item.item_type === 'document' ? 'Document' : 'Step'} · ${item.requirement_type === 'required' ? 'Required' : 'Optional'}`}
        headerAccessory={header}
        size={size}
        lockBodyScroll
      >
        {body}
      </Modal>
      {nestedModals}
    </>
  )
}
