'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckSquare, Square, Trash2, ExternalLink, Pencil, Plus, ChevronDown } from 'lucide-react'
import AddLeadModal from './AddLeadModal'
import { type LeadContext, LEAD_STAGES, NOTE_TYPES } from '@/lib/constants/lead-configs'
import {
  updateLeadStage,
  addLeadNote,
  deleteLeadNote,
  addLeadTask,
  completeLeadTask,
  uncompleteLeadTask,
  deleteLeadTask,
  convertLeadToAgency,
  archiveLead,
} from '@/app/actions/leads'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConvertedAgency { id: string; name: string }

interface Lead {
  id: string
  lead_type: string
  agency_id: string | null
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  contact_phone: string | null
  company_name: string | null
  service_type: string | null
  stage: string
  source: string | null
  price: number | null
  retainer_amount: number | null
  retainer_paid_date: string | null
  installments: number | null
  installment_amount: number | null
  signed_date: string | null
  notes: string | null
  converted_agency_id: string | null
  converted_client_id: string | null
  converted_at: string | null
  status: string
  created_at: string
  contact_address1: string | null
  contact_address2: string | null
  contact_city: string | null
  contact_state: string | null
  contact_zip: string | null
  converted_agency: ConvertedAgency | null
}

interface LeadNote {
  id: string
  author_id: string
  content: string
  note_type: string
  created_at: string
  author: { full_name: string | null } | null
}

interface LeadTask {
  id: string
  title: string
  due_date: string | null
  completed_at: string | null
  assigned_to: string | null
  created_at: string
}

interface LeadDetailContentProps {
  lead: Lead
  notes: LeadNote[]
  tasks: LeadTask[]
  context: LeadContext
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
}

function formatCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatDate(iso)
}

function isOverdue(task: LeadTask) {
  if (task.completed_at || !task.due_date) return false
  return new Date(task.due_date) < new Date(new Date().toDateString())
}

function isDueToday(task: LeadTask) {
  if (task.completed_at || !task.due_date) return false
  return new Date(task.due_date).toDateString() === new Date().toDateString()
}

const noteTypeColorMap: Record<string, string> = {
  call:    'bg-blue-100 text-blue-700',
  email:   'bg-indigo-100 text-indigo-700',
  meeting: 'bg-blue-100 text-blue-700',
  general: 'bg-gray-100 text-gray-600',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadDetailContent({ lead, notes, tasks, context }: LeadDetailContentProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'overview' | 'notes' | 'tasks'>('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Notes state
  const [noteTypeFilter, setNoteTypeFilter] = useState('all')
  const [newNoteType, setNewNoteType] = useState('general')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  // Tasks state
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  // Conversion state
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [showAgencyNamePrompt, setShowAgencyNamePrompt] = useState(false)
  const [agencyNameInput, setAgencyNameInput] = useState('')

  const stageColorMap = Object.fromEntries(LEAD_STAGES.map(s => [s.key, s.color]))
  const serviceTypeLabel = (key: string | null) =>
    key ? context.serviceTypes.find(s => s.key === key)?.label ?? key : '—'

  const displayName = `${lead.contact_first_name ?? ''} ${lead.contact_last_name ?? ''}`.trim() || '(No name)'

  // ─── Stage change ──────────────────────────────────────────────

  const handleStageChange = (stage: string) => {
    startTransition(async () => {
      await updateLeadStage(lead.id, stage)
      router.refresh()
    })
  }

  // ─── Convert to Agency ────────────────────────────────────────

  const handleConvertToAgency = async () => {
    if (!lead.company_name?.trim()) {
      setShowAgencyNamePrompt(true)
      return
    }
    setConverting(true)
    setConvertError(null)
    const result = await convertLeadToAgency(lead.id)
    setConverting(false)
    if (result.error) { setConvertError(result.error); return }
    router.push(`/pages/admin/agencies/${result.agencyId}`)
  }

  const handleConvertWithName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agencyNameInput.trim()) return
    setConverting(true)
    setConvertError(null)
    const result = await convertLeadToAgency(lead.id, agencyNameInput.trim())
    setConverting(false)
    if (result.error) { setConvertError(result.error); return }
    router.push(`/pages/admin/agencies/${result.agencyId}`)
  }

  // ─── Notes ────────────────────────────────────────────────────

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNoteContent.trim()) return
    setAddingNote(true)
    setNoteError(null)
    const result = await addLeadNote(lead.id, { content: newNoteContent, noteType: newNoteType })
    setAddingNote(false)
    if (result.error) { setNoteError(result.error); return }
    setNewNoteContent('')
    router.refresh()
  }

  const handleDeleteNote = async (noteId: string) => {
    await deleteLeadNote(lead.id, noteId)
    router.refresh()
  }

  const filteredNotes = noteTypeFilter === 'all'
    ? notes
    : notes.filter(n => n.note_type === noteTypeFilter)

  // ─── Tasks ────────────────────────────────────────────────────

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setAddingTask(true)
    setTaskError(null)
    const result = await addLeadTask(lead.id, { title: newTaskTitle, dueDate: newTaskDueDate || null })
    setAddingTask(false)
    if (result.error) { setTaskError(result.error); return }
    setNewTaskTitle('')
    setNewTaskDueDate('')
    router.refresh()
  }

  const handleToggleTask = async (task: LeadTask) => {
    if (task.completed_at) {
      await uncompleteLeadTask(lead.id, task.id)
    } else {
      await completeLeadTask(lead.id, task.id)
    }
    router.refresh()
  }

  const handleDeleteTask = async (taskId: string) => {
    await deleteLeadTask(lead.id, taskId)
    router.refresh()
  }

  const pendingTasks = tasks.filter(t => !t.completed_at)
  const completedTasks = tasks.filter(t => t.completed_at)

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Back + title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(context.listPath)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 truncate">{displayName}</h1>
            {lead.company_name && <p className="text-sm text-gray-500">{lead.company_name}</p>}
          </div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-1">
            {(['overview', 'notes', 'tasks'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t}
                {t === 'notes' && notes.length > 0 && (
                  <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{notes.length}</span>
                )}
                {t === 'tasks' && pendingTasks.length > 0 && (
                  <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">{pendingTasks.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ─── Overview Tab ──────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: contact + stage */}
            <div className="lg:col-span-2 space-y-4">
              {/* Contact card */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="text-gray-900 font-medium">{displayName}</dd>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="text-gray-900">{lead.contact_email || '—'}</dd>
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="text-gray-900">{lead.contact_phone || '—'}</dd>
                  {context.leadType === 'agency' && (
                    <>
                      <dt className="text-gray-500">Company</dt>
                      <dd className="text-gray-900">{lead.company_name || '—'}</dd>
                    </>
                  )}
                  <dt className="text-gray-500">Service Type</dt>
                  <dd className="text-gray-900">{serviceTypeLabel(lead.service_type)}</dd>
                  {(lead.contact_address1 || lead.contact_city) && (
                    <>
                      <dt className="text-gray-500">Address</dt>
                      <dd className="text-gray-900">
                        {lead.contact_address1 && <div>{lead.contact_address1}</div>}
                        {lead.contact_address2 && <div>{lead.contact_address2}</div>}
                        {(lead.contact_city || lead.contact_state || lead.contact_zip) && (
                          <div>
                            {[lead.contact_city, lead.contact_state, lead.contact_zip].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              </div>

              {/* Notes preview (general) */}
              {lead.notes && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}

              {/* Billing (admin only) */}
              {context.billingVisible && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Billing</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500">Price</dt>
                    <dd className="text-gray-900 font-medium">{formatCurrency(lead.price)}</dd>
                    <dt className="text-gray-500">Retainer</dt>
                    <dd className="text-gray-900">{formatCurrency(lead.retainer_amount)}</dd>
                    <dt className="text-gray-500">Retainer Paid</dt>
                    <dd className="text-gray-900">{formatDate(lead.retainer_paid_date)}</dd>
                    <dt className="text-gray-500">Installments</dt>
                    <dd className="text-gray-900">{lead.installments != null ? (lead.installments === 0 ? 'Paid in full' : String(lead.installments)) : '—'}</dd>
                    {lead.installments != null && lead.installments > 0 && (
                      <>
                        <dt className="text-gray-500">Per Installment</dt>
                        <dd className="text-gray-900">{formatCurrency(lead.installment_amount)}</dd>
                      </>
                    )}
                    <dt className="text-gray-500">Signed Date</dt>
                    <dd className="text-gray-900">{formatDate(lead.signed_date)}</dd>
                  </dl>
                </div>
              )}
            </div>

            {/* Right: stage + conversion */}
            <div className="space-y-4">
              {/* Stage */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Stage</h3>
                <div className="relative">
                  <select
                    value={lead.stage}
                    onChange={e => handleStageChange(e.target.value)}
                    disabled={isPending}
                    className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                  >
                    {LEAD_STAGES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <div className="mt-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${stageColorMap[lead.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                    {LEAD_STAGES.find(s => s.key === lead.stage)?.label ?? lead.stage}
                  </span>
                </div>
              </div>

              {/* Conversion */}
              {context.conversionAction && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Conversion</h3>
                  {lead.converted_agency_id && lead.converted_agency ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-green-700 mb-1">Converted</p>
                      <a
                        href={`/pages/admin/agencies/${lead.converted_agency.id}`}
                        className="flex items-center gap-1.5 text-sm text-green-800 font-medium hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {lead.converted_agency.name}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ) : lead.converted_client_id ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-green-700">Converted to patient</p>
                    </div>
                  ) : (
                    <div>
                      {context.conversionAction === 'agency' ? (
                        <>
                          {lead.stage !== 'signed' ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                              Lead must reach the <span className="font-semibold text-gray-700">Signed</span> stage before it can be converted to an agency.
                            </div>
                          ) : showAgencyNamePrompt ? (
                            <form onSubmit={handleConvertWithName} className="space-y-2">
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                No company name on this lead. Enter the agency name to continue.
                              </p>
                              <input
                                type="text"
                                value={agencyNameInput}
                                onChange={e => setAgencyNameInput(e.target.value)}
                                placeholder="Agency name…"
                                required
                                autoFocus
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setShowAgencyNamePrompt(false); setAgencyNameInput('') }}
                                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={converting || !agencyNameInput.trim()}
                                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                >
                                  {converting ? 'Converting…' : 'Convert →'}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={handleConvertToAgency}
                              disabled={converting}
                              className="w-full px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              {converting ? 'Converting…' : context.conversionLabel}
                            </button>
                          )}
                          {convertError && <p className="mt-2 text-xs text-red-600">{convertError}</p>}
                        </>
                      ) : (
                        <a
                          href={`/pages/agency/clients?lead=${lead.id}&firstName=${encodeURIComponent(lead.contact_first_name ?? '')}&lastName=${encodeURIComponent(lead.contact_last_name ?? '')}&email=${encodeURIComponent(lead.contact_email ?? '')}&phone=${encodeURIComponent(lead.contact_phone ?? '')}`}
                          className="block w-full px-3 py-2 text-sm font-medium text-center text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                        >
                          {context.conversionLabel}
                        </a>
                      )}
                      <p className="mt-2 text-xs text-gray-400">
                        {context.conversionAction === 'agency'
                          ? 'Creates a shell agency record.'
                          : 'Opens new patient form pre-filled with contact info.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Meta */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Info</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Added</dt>
                    <dd className="text-gray-700">{formatDate(lead.created_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Status</dt>
                    <dd className={`font-medium ${lead.status === 'archived' ? 'text-gray-400' : 'text-green-600'}`}>
                      {lead.status === 'archived' ? 'Archived' : 'Active'}
                    </dd>
                  </div>
                  {lead.source && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Source</dt>
                      <dd>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {lead.source}
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
                {lead.status === 'active' && (
                  <button
                    type="button"
                    onClick={async () => { await archiveLead(lead.id); router.push(context.listPath) }}
                    className="mt-3 w-full px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Archive Lead
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Notes Tab ─────────────────────────────────────────────── */}
        {tab === 'notes' && (
          <div className="space-y-4">
            {/* Add note */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Note</h3>
              <form onSubmit={handleAddNote} className="space-y-3">
                <div className="flex gap-2">
                  {NOTE_TYPES.map(nt => (
                    <button
                      key={nt.key}
                      type="button"
                      onClick={() => setNewNoteType(nt.key)}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                        newNoteType === nt.key
                          ? (noteTypeColorMap[nt.key] ?? 'bg-gray-200 text-gray-700')
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {nt.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={newNoteContent}
                  onChange={e => setNewNoteContent(e.target.value)}
                  placeholder="Write a note…"
                  rows={3}
                  className={`${inputCls} resize-none`}
                  required
                />
                {noteError && <p className="text-xs text-red-600">{noteError}</p>}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={addingNote || !newNoteContent.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {addingNote ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              </form>
            </div>

            {/* Filter + feed */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">Filter:</span>
                <button
                  type="button"
                  onClick={() => setNoteTypeFilter('all')}
                  className={`px-2.5 py-1 text-xs rounded-full font-medium ${noteTypeFilter === 'all' ? 'bg-gray-200 text-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  All
                </button>
                {NOTE_TYPES.map(nt => (
                  <button
                    key={nt.key}
                    type="button"
                    onClick={() => setNoteTypeFilter(nt.key)}
                    className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                      noteTypeFilter === nt.key
                        ? (noteTypeColorMap[nt.key] ?? 'bg-gray-200 text-gray-700')
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {nt.label}
                  </button>
                ))}
              </div>

              {filteredNotes.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No notes yet.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredNotes.map(note => (
                    <li key={note.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${noteTypeColorMap[note.note_type] ?? 'bg-gray-100 text-gray-600'}`}>
                              {NOTE_TYPES.find(nt => nt.key === note.note_type)?.label ?? note.note_type}
                            </span>
                            <span className="text-xs text-gray-400">{note.author?.full_name ?? 'Unknown'}</span>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-400">{relativeTime(note.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ─── Tasks Tab ─────────────────────────────────────────────── */}
        {tab === 'tasks' && (
          <div className="space-y-4">
            {/* Add task */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Task</h3>
              <form onSubmit={handleAddTask} className="flex gap-2">
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Task title…"
                  className={`${inputCls} flex-1 min-w-0`}
                  required
                />
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={e => setNewTaskDueDate(e.target.value)}
                  className="flex-shrink-0 w-100 px-0 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none cursor-pointer"
                  title="Due date"
                />
                <button
                  type="submit"
                  disabled={addingTask || !newTaskTitle.trim()}
                  className="flex-shrink-0 px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              {taskError && <p className="mt-2 text-xs text-red-600">{taskError}</p>}
            </div>

            {/* Pending tasks */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Pending ({pendingTasks.length})
                </span>
              </div>
              {pendingTasks.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No pending tasks.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pendingTasks.map(task => {
                    const overdue = isOverdue(task)
                    const dueToday = isDueToday(task)
                    return (
                      <li
                        key={task.id}
                        className={`px-5 py-3.5 flex items-center gap-3 ${overdue ? 'border-l-2 border-red-400' : dueToday ? 'border-l-2 border-orange-400' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleTask(task)}
                          className="flex-shrink-0 text-gray-400 hover:text-green-600 transition-colors"
                        >
                          <Square className="w-4.5 h-4.5 w-[18px] h-[18px]" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">{task.title}</p>
                          {task.due_date && (
                            <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-medium' : dueToday ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                              {overdue ? 'Overdue · ' : dueToday ? 'Due today · ' : 'Due '}
                              {formatDate(task.due_date)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          className="flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowCompleted(p => !p)}
                  className="w-full px-5 py-3 border-b border-gray-100 flex items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Completed ({completedTasks.length})
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
                </button>
                {showCompleted && (
                  <ul className="divide-y divide-gray-100">
                    {completedTasks.map(task => (
                      <li key={task.id} className="px-5 py-3.5 flex items-center gap-3 opacity-60">
                        <button
                          type="button"
                          onClick={() => handleToggleTask(task)}
                          className="flex-shrink-0 text-green-500 hover:text-gray-400 transition-colors"
                        >
                          <CheckSquare className="w-[18px] h-[18px]" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 line-through">{task.title}</p>
                          {task.completed_at && (
                            <p className="text-xs text-gray-400 mt-0.5">Completed {relativeTime(task.completed_at)}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          className="flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <AddLeadModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={() => { setEditOpen(false); router.refresh() }}
        context={context}
        editLead={lead}
      />
    </>
  )
}
