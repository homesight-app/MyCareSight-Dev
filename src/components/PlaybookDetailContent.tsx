'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Minus, Loader2, Upload, FileText, Edit2, Trash2 } from 'lucide-react'
import PlaybookTab from './PlaybookTab'
import Modal from './Modal'
import { createClient } from '@/lib/supabase/client'
import { updatePlaybook, createPlaybookTemplate, updatePlaybookTemplateAction, deletePlaybookTemplateAction } from '@/app/actions/playbooks'
import type { PlaybookItem, PlaybookTemplate } from '@/lib/supabase/query/playbooks'

export type PlaybookRow = {
  id: string
  name: string
  playbook_type: string
  description: string | null
  is_active: boolean
  state: string | null
  cost_min: number | null
  cost_max: number | null
  cost_display: string | null
  service_fee: number | null
  service_fee_display: string | null
  processing_time_min: number | null
  processing_time_max: number | null
  processing_time_display: string | null
  renewal_period_years: number | null
  renewal_period_display: string | null
  icon_type: string | null
  requirements: string[] | null
}

interface Props {
  playbook: PlaybookRow
  licenseRequirementId: string | null
  initialItems: PlaybookItem[]
  initialTemplates: PlaybookTemplate[]
}

type TabType = 'general' | 'items' | 'templates'

// ── Format helpers (mirrors LicenseTypeDetails) ─────────────────────────────

function extractProcessingTime(value: string) {
  return value.replace(/days?/gi, '').replace(/[^0-9.\-\s]/g, '').trim()
}

function extractCurrency(value: string) {
  return value.replace(/[$,]/g, '').trim()
}

function extractNumber(value: string) {
  return value.replace(/[^0-9.]/g, '')
}

function formatProcessingTime(value: string): string {
  if (value.includes('-')) {
    const parts = value.split('-').map(p => p.trim().replace(/[^0-9.]/g, ''))
    if (parts.length === 2 && parts[0] && parts[1]) return `${parts[0]}-${parts[1]} days`
  }
  const num = extractNumber(value)
  return num ? `${num} days` : ''
}

function formatCurrency(value: string): string {
  if (value.includes('-')) {
    const parts = value.split('-').map(p => {
      const n = parseFloat(p.replace(/[^0-9.]/g, ''))
      return isNaN(n) ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    })
    if (parts.length === 2 && parts[0] && parts[1]) return `$${parts[0]}-$${parts[1]}`
  }
  const n = parseFloat(value.replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return ''
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatRenewalPeriod(value: string): string {
  const n = parseFloat(extractNumber(value))
  if (isNaN(n) || n === 0) return ''
  return n === 1 ? '1 year' : `${n} years`
}

function tabCls(active: boolean) {
  return `py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
    active
      ? 'border-blue-600 text-blue-600 bg-gray-50'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
  }`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PlaybookDetailContent({ playbook, licenseRequirementId, initialItems, initialTemplates }: Props) {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [isActive, setIsActive] = useState(playbook.is_active)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [requirements, setRequirements] = useState<string[]>(playbook.requirements ?? [])
  const [newRequirement, setNewRequirement] = useState('')
  const [itemCount, setItemCount] = useState(initialItems.length)

  // Templates state
  const [templates, setTemplates] = useState<PlaybookTemplate[]>(initialTemplates)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PlaybookTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({ templateName: '', description: '' })
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Overview fields
  const [overviewFields, setOverviewFields] = useState({
    name: playbook.name,
    description: playbook.description ?? '',
    processingTime: playbook.processing_time_display ?? '',
    applicationFee: playbook.cost_display ?? '',
    serviceFee: playbook.service_fee_display ?? '',
    renewalPeriod: playbook.renewal_period_display ?? '',
    iconType: playbook.icon_type ?? '',
  })

  const overviewFieldsRef = useRef(overviewFields)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { overviewFieldsRef.current = overviewFields }, [overviewFields])
  useEffect(() => { return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) } }, [])

  const scheduleFieldSave = (field: string, value: string) => {
    const updated = { ...overviewFieldsRef.current, [field]: value }
    setOverviewFields(updated)
    overviewFieldsRef.current = updated

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setSaveStatus('saving')

    saveTimeoutRef.current = setTimeout(async () => {
      const cur = overviewFieldsRef.current
      await updatePlaybook(playbook.id, {
        name: cur.name || playbook.name,
        description: cur.description || null,
        processing_time_display: cur.processingTime || null,
        cost_display: cur.applicationFee || null,
        service_fee_display: cur.serviceFee || null,
        renewal_period_display: cur.renewalPeriod || null,
        icon_type: cur.iconType || null,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }, 1000)
  }

  const saveNow = async (patch: Record<string, unknown>) => {
    setSaveStatus('saving')
    await updatePlaybook(playbook.id, patch)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  const handleToggleActive = async () => {
    const next = !isActive
    setIsActive(next)
    await saveNow({ is_active: next })
  }

  const addRequirement = () => {
    if (!newRequirement.trim()) return
    const next = [...requirements, newRequirement.trim()]
    setRequirements(next)
    setNewRequirement('')
    saveNow({ requirements: next })
  }

  const removeRequirement = (idx: number) => {
    const next = requirements.filter((_, i) => i !== idx)
    setRequirements(next)
    saveNow({ requirements: next })
  }

  // ── Template handlers ────────────────────────────────────────────────────

  const handleDownloadTemplate = async (fileUrlOrPath: string) => {
    if (fileUrlOrPath.startsWith('http')) { window.open(fileUrlOrPath, '_blank'); return }
    const { data } = await supabase.storage.from('license-templates').createSignedUrl(fileUrlOrPath, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const handleUploadTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!templateFile) return
    setIsSubmitting(true)
    setError(null)
    try {
      const fileExt = templateFile.name.split('.').pop()
      const filePath = `playbooks/${playbook.id}/${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('license-templates')
        .upload(filePath, templateFile, { upsert: false, contentType: templateFile.type || 'application/octet-stream', cacheControl: '3600' })
      if (uploadError) { setError(uploadError.message); return }

      const result = await createPlaybookTemplate({
        playbookId: playbook.id,
        templateName: templateForm.templateName,
        description: templateForm.description,
        fileUrl: filePath,
        fileName: templateFile.name,
      })
      if (result.error) { setError(result.error); return }

      setShowUploadModal(false)
      setTemplateForm({ templateName: '', description: '' })
      setTemplateFile(null)
      // Reload templates from DB
      const { data: fresh } = await supabase
        .from('playbook_templates')
        .select('id, playbook_id, template_name, description, file_url, file_name, created_at')
        .eq('playbook_id', playbook.id)
        .order('template_name')
      setTemplates((fresh ?? []) as PlaybookTemplate[])
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTemplate) return
    setIsSubmitting(true)
    setError(null)
    const result = await updatePlaybookTemplateAction(editingTemplate.id, templateForm)
    if (result.error) { setError(result.error); setIsSubmitting(false); return }
    setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, template_name: templateForm.templateName, description: templateForm.description || null } : t))
    setEditingTemplate(null)
    setTemplateForm({ templateName: '', description: '' })
    setIsSubmitting(false)
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return
    setIsSubmitting(true)
    const result = await deletePlaybookTemplateAction(id)
    if (result.error) { setError(result.error) } else { setTemplates(prev => prev.filter(t => t.id !== id)) }
    setIsSubmitting(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 md:p-6">
      {/* Tab nav */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-4" aria-label="Tabs">
          <button onClick={() => setActiveTab('general')} className={tabCls(activeTab === 'general')}>
            General Info
          </button>
          <button onClick={() => setActiveTab('items')} className={tabCls(activeTab === 'items')}>
            Items {itemCount > 0 && `(${itemCount})`}
          </button>
          <button onClick={() => setActiveTab('templates')} className={tabCls(activeTab === 'templates')}>
            Templates {templates.length > 0 && `(${templates.length})`}
          </button>
        </nav>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="min-h-[300px]">

        {/* ── General Info ─────────────────────────────────────────────── */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Playbook Details</h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{isActive ? 'Active' : 'Inactive'}</span>
                <button
                  onClick={handleToggleActive}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                {saveStatus === 'saving' && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>}
                {saveStatus === 'saved' && <span className="text-xs text-green-600">Saved</span>}
              </div>
            </div>

            <div className="space-y-4">
              {/* Average Processing Time */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Average Processing Time</label>
                <input
                  type="text"
                  value={overviewFields.processingTime}
                  onFocus={e => { setOverviewFields(f => ({ ...f, processingTime: extractProcessingTime(e.target.value) })); e.target.select() }}
                  onBlur={e => { const fmt = formatProcessingTime(e.target.value); setOverviewFields(f => ({ ...f, processingTime: fmt })); if (fmt) scheduleFieldSave('processingTime', fmt) }}
                  onChange={e => setOverviewFields(f => ({ ...f, processingTime: e.target.value }))}
                  className="bg-white w-full text-2xl font-bold text-gray-900 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                  placeholder="60 days"
                />
                <p className="text-sm text-gray-600">How long it typically takes to process this license type</p>
              </div>

              {/* Application Fee */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Application Fee</label>
                <input
                  type="text"
                  value={overviewFields.applicationFee}
                  onFocus={e => { setOverviewFields(f => ({ ...f, applicationFee: extractCurrency(e.target.value) })); e.target.select() }}
                  onBlur={e => { const fmt = formatCurrency(e.target.value); setOverviewFields(f => ({ ...f, applicationFee: fmt })); if (fmt) scheduleFieldSave('applicationFee', fmt) }}
                  onChange={e => setOverviewFields(f => ({ ...f, applicationFee: e.target.value }))}
                  className="bg-white w-full text-2xl font-bold text-gray-900 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                  placeholder="$500"
                />
                <p className="text-sm text-gray-600">Cost to apply for this license</p>
              </div>

              {/* Service Fee */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Service Fee</label>
                <input
                  type="text"
                  value={overviewFields.serviceFee}
                  onFocus={e => { setOverviewFields(f => ({ ...f, serviceFee: extractCurrency(e.target.value) })); e.target.select() }}
                  onBlur={e => { const fmt = formatCurrency(e.target.value); setOverviewFields(f => ({ ...f, serviceFee: fmt })); if (fmt) scheduleFieldSave('serviceFee', fmt) }}
                  onChange={e => setOverviewFields(f => ({ ...f, serviceFee: e.target.value }))}
                  className="bg-white w-full text-2xl font-bold text-gray-900 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                  placeholder="$3,500"
                />
                <p className="text-sm text-gray-600">Cost of helping the owner submit their license</p>
              </div>

              {/* Renewal Period */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Renewal Period</label>
                <input
                  type="text"
                  value={overviewFields.renewalPeriod}
                  onFocus={e => { setOverviewFields(f => ({ ...f, renewalPeriod: extractNumber(e.target.value) })); e.target.select() }}
                  onBlur={e => { const fmt = formatRenewalPeriod(e.target.value); setOverviewFields(f => ({ ...f, renewalPeriod: fmt })); if (fmt) scheduleFieldSave('renewalPeriod', fmt) }}
                  onChange={e => setOverviewFields(f => ({ ...f, renewalPeriod: e.target.value }))}
                  className="bg-white w-full text-2xl font-bold text-gray-900 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                  placeholder="1 year"
                />
                <p className="text-sm text-gray-600">How often this license needs to be renewed</p>
              </div>
            </div>

            {/* Description */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Description</label>
              <textarea
                value={overviewFields.description}
                onChange={e => scheduleFieldSave('description', e.target.value)}
                rows={3}
                placeholder="Brief description of this playbook…"
                className="w-full bg-white text-gray-900 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 text-sm resize-none hover:bg-white/50 transition-colors"
              />
            </div>

            {/* Icon */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Icon</label>
              <select
                value={overviewFields.iconType}
                onChange={e => { const val = e.target.value; setOverviewFields(f => ({ ...f, iconType: val })); scheduleFieldSave('iconType', val) }}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— None —</option>
                <option value="heart">Heart (Home Care)</option>
                <option value="users">Users (Agency)</option>
              </select>
            </div>

            {/* Key Requirements */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Key Requirements <span className="text-gray-400 font-normal text-xs">(shown to agencies in request modal)</span>
              </label>
              <div className="space-y-2 mb-3">
                {requirements.map((req, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5">{req}</span>
                    <button onClick={() => removeRequirement(idx)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {requirements.length === 0 && <p className="text-sm text-gray-400 italic">No requirements added yet.</p>}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRequirement}
                  onChange={e => setNewRequirement(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRequirement()}
                  placeholder="Add a key requirement…"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button onClick={addRequirement} className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>

            {/* Playbook Name */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Playbook Name</label>
              <input
                type="text"
                value={overviewFields.name}
                onChange={e => scheduleFieldSave('name', e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* ── Items ────────────────────────────────────────────────────── */}
        {activeTab === 'items' && (
          <PlaybookTab
            playbookId={playbook.id}
            licenseRequirementId={licenseRequirementId ?? undefined}
            initialItems={initialItems}
            onItemCountChange={setItemCount}
          />
        )}

        {/* ── Templates ────────────────────────────────────────────────── */}
        {activeTab === 'templates' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Document Templates</h3>
                <p className="text-sm text-gray-600 mt-1">Upload sample documents that agencies can download when their program is active.</p>
              </div>
              <button
                onClick={() => { setShowUploadModal(true); setTemplateForm({ templateName: '', description: '' }); setTemplateFile(null); setError(null) }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Template
              </button>
            </div>

            {/* Upload modal */}
            <Modal isOpen={showUploadModal} onClose={() => { setShowUploadModal(false); setTemplateFile(null); setError(null) }} title="Upload Template" size="lg">
              <form onSubmit={handleUploadTemplate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={templateForm.templateName}
                    onChange={e => setTemplateForm(f => ({ ...f, templateName: e.target.value }))}
                    placeholder="e.g., Sample Application Form"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={templateForm.description}
                    onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description of this template"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
                  <label className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 min-h-[42px] flex items-center">
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => setTemplateFile(e.target.files?.[0] ?? null)} className="sr-only" />
                    <span className="text-sm text-gray-700 pointer-events-none">{templateFile ? templateFile.name : 'Choose a file…'}</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1">Accepted: PDF, DOC, DOCX, XLS, XLSX</p>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={isSubmitting || !templateFile} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <Upload className="w-4 h-4" /> Upload
                  </button>
                  <button type="button" onClick={() => { setShowUploadModal(false); setTemplateFile(null); setError(null) }} className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </Modal>

            {/* Edit modal */}
            {editingTemplate && (
              <Modal isOpen={!!editingTemplate} onClose={() => { setEditingTemplate(null); setError(null) }} title="Edit Template" size="md">
                <form onSubmit={handleUpdateTemplate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                    <input
                      type="text"
                      value={templateForm.templateName}
                      onChange={e => setTemplateForm(f => ({ ...f, templateName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={templateForm.description}
                      onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => { setEditingTemplate(null); setError(null) }} className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                  </div>
                </form>
              </Modal>
            )}

            {/* Template list */}
            {templates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No templates uploaded yet.</p>
                <p className="text-sm text-gray-400 mt-2">Upload sample documents for agencies to download.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map(tpl => (
                  <div key={tpl.id} className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900">{tpl.template_name}</h4>
                      {tpl.description && <p className="text-sm text-gray-600 mt-0.5">{tpl.description}</p>}
                      <p className="text-sm text-gray-500 mt-1">
                        {tpl.file_name}
                        <span className="ml-2 text-gray-400">{new Date(tpl.created_at).toLocaleDateString()}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleDownloadTemplate(tpl.file_url)} className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Download" type="button">
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setEditingTemplate(tpl); setTemplateForm({ templateName: tpl.template_name, description: tpl.description ?? '' }); setError(null) }}
                        className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Edit template"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteTemplate(tpl.id)} disabled={isSubmitting} className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50" title="Delete template">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
