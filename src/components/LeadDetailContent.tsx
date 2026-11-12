'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckSquare, Square, Trash2, ExternalLink, Pencil, Plus, ChevronDown } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import Tabs from '@/components/ui/Tabs'
import Badge, { type BadgeColor } from '@/components/ui/Badge'
import AddLeadModal from './AddLeadModal'
import EditPatientLeadDetailsModal from './EditPatientLeadDetailsModal'
import AddNewClientModal from './AddNewClientModal'
import LeadSignedModal from './LeadSignedModal'
import LeadCollectRetainerModal from './LeadCollectRetainerModal'
import ConvertToAgencyPromptModal from './ConvertToAgencyPromptModal'
import { type LeadContext, LEAD_STAGES, NOTE_TYPES, type AgencyLeadStage } from '@/lib/constants/lead-configs'
import type { PatientLeadDetails } from '@/lib/supabase/query/leads'
import {
  updateLead,
  updateLeadStage,
  addLeadNote,
  deleteLeadNote,
  addLeadTask,
  updateLeadTaskAssignee,
  completeLeadTask,
  uncompleteLeadTask,
  deleteLeadTask,
  convertLeadToAgency,
  archiveLead,
  unlinkLeadFromAgency,
} from '@/app/actions/leads'
import LeadDocumentsTab, { type LeadDocument } from './LeadDocumentsTab'

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
  lead_owner_id: string | null
  proposal_sent_date: string | null
  service_states: string[] | null
  lead_owner?: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null
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
  created_by: string
  created_at: string
  creator: { id: string; full_name: string | null } | null
  assignee: { id: string; full_name: string | null } | null
}

interface LeadDetailContentProps {
  lead: Lead
  notes: LeadNote[]
  tasks: LeadTask[]
  documents: LeadDocument[]
  context: LeadContext
  currentUserId: string
  currentUserRole?: string | null
  platformStaff?: { id: string; full_name: string | null }[]
  stages?: AgencyLeadStage[]
  patientDetails?: PatientLeadDetails | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Date-only strings (YYYY-MM-DD) are parsed as UTC by JS; append T00:00:00 to force local time.
function parseDate(val: string): Date {
  return val.includes('T') ? new Date(val) : new Date(val + 'T00:00:00')
}

function formatDate(val: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!val) return '—'
  try {
    return parseDate(val).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
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
  return parseDate(task.due_date) < new Date(new Date().toDateString())
}

function isDueToday(task: LeadTask) {
  if (task.completed_at || !task.due_date) return false
  return parseDate(task.due_date).toDateString() === new Date().toDateString()
}

const NOTE_TYPE_COLOR: Record<string, BadgeColor> = {
  call:    'blue',
  email:   'purple',
  meeting: 'teal',
  general: 'gray',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadDetailContent({ lead, notes, tasks, documents, context, currentUserId, currentUserRole, platformStaff = [], stages, patientDetails }: LeadDetailContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (['overview', 'notes', 'tasks', 'documents'] as const).find(t => t === searchParams.get('tab')) ?? 'overview'
  const [tab, setTab] = useState<'overview' | 'notes' | 'tasks' | 'documents'>(initialTab)
  const [unlinking, setUnlinking] = useState(false)
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
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUserId)
  const [addingTask, setAddingTask] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  // Conversion state
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [showAgencyNamePrompt, setShowAgencyNamePrompt] = useState(false)
  const [agencyNameInput, setAgencyNameInput] = useState('')

  // Patient details modal state
  const [editPatientDetailsOpen, setEditPatientDetailsOpen] = useState(false)
  const [convertClientOpen, setConvertClientOpen] = useState(false)

  // Signed / retainer modal state
  const [signedPromptOpen, setSignedPromptOpen]         = useState(false)
  const [collectRetainerOpen, setCollectRetainerOpen]   = useState(false)
  const [showConvertPrompt, setShowConvertPrompt]        = useState(false)

  const owners = platformStaff

  const activeStages = stages && stages.length > 0 ? stages : (LEAD_STAGES as unknown as AgencyLeadStage[])
  const stageColorMap = Object.fromEntries(activeStages.map(s => [s.key, s.color]))
  const serviceTypeLabel = (key: string | null) =>
    key ? context.serviceTypes.find(s => s.key === key)?.label ?? key : '—'

  const displayName = `${lead.contact_first_name ?? ''} ${lead.contact_last_name ?? ''}`.trim() || '(No name)'
  const isConverted = Boolean(
    lead.converted_at && (lead.converted_agency_id || lead.converted_client_id),
  )

  // ─── Stage change ──────────────────────────────────────────────

  const handleStageChange = (stage: string) => {
    if (stage === 'signed' || stage === 'retainer') {
      if (lead.stage === 'retainer' && stage === 'signed') {
        setCollectRetainerOpen(true)
      } else {
        setSignedPromptOpen(true)
      }
      return
    }
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
    const result = await addLeadTask(lead.id, {
      title: newTaskTitle,
      dueDate: newTaskDueDate || null,
      assignedTo: newTaskAssignee || null,
    })
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

  const handleTaskAssigneeChange = async (taskId: string, assignedTo: string) => {
    setTaskError(null)
    const result = await updateLeadTaskAssignee(lead.id, taskId, assignedTo || null)
    if (result.error) { setTaskError(result.error); return }
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
          {!isConverted && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>

        {isConverted && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-medium">Converted lead — read only</p>
            <p className="mt-0.5 text-blue-700">
              This historical lead is locked. Manage ongoing information from the converted record.
            </p>
          </div>
        )}

        {/* Tabs */}
        <Tabs
          variant="underline"
          items={[
            { key: 'overview',   label: 'Overview' },
            { key: 'notes',      label: 'Notes',     count: notes.length > 0 ? notes.length : undefined },
            { key: 'tasks',      label: 'Tasks',     count: pendingTasks.length > 0 ? pendingTasks.length : undefined },
            { key: 'documents',  label: 'Documents', count: documents.length > 0 ? documents.length : undefined },
          ]}
          active={tab}
          onChange={(key) => setTab(key as typeof tab)}
        />

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
                      <dt className="text-gray-500">Agency</dt>
                      <dd className="text-gray-900">{lead.company_name || '—'}</dd>
                    </>
                  )}
                  <dt className="text-gray-500">Service Type</dt>
                  <dd className="text-gray-900">{serviceTypeLabel(lead.service_type)}</dd>
                  {lead.service_states && lead.service_states.length > 0 && (
                    <>
                      <dt className="text-gray-500">Service State(s)</dt>
                      <dd className="text-gray-900">{lead.service_states.slice().sort().join(', ')}</dd>
                    </>
                  )}
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

              {/* Patient Details card — patient context only */}
              {context.leadType === 'patient' && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Lead Contact Details</h3>
                    {!isConverted && (
                      <button
                        type="button"
                        onClick={() => setEditPatientDetailsOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Point of Contact */}
                  {(patientDetails?.poc_name || patientDetails?.poc_phone || patientDetails?.poc_relationship || patientDetails?.poc_email) && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Point of Contact</p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        {patientDetails?.poc_name && (
                          <>
                            <dt className="text-gray-500">Name</dt>
                            <dd className="text-gray-900">{patientDetails.poc_name}</dd>
                          </>
                        )}
                        {patientDetails?.poc_phone && (
                          <>
                            <dt className="text-gray-500">Phone</dt>
                            <dd className="text-gray-900">{patientDetails.poc_phone}</dd>
                          </>
                        )}
                        {patientDetails?.poc_relationship && (
                          <>
                            <dt className="text-gray-500">Relationship</dt>
                            <dd className="text-gray-900 capitalize">{patientDetails.poc_relationship.replace('_', ' ')}</dd>
                          </>
                        )}
                        {patientDetails?.poc_email && (
                          <>
                            <dt className="text-gray-500">Email</dt>
                            <dd className="text-gray-900">{patientDetails.poc_email}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Only minimum-necessary lead data is shown before intake. */}
                  {patientDetails?.start_date && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Service Timing</p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-gray-500">Desired Start Date</dt>
                        <dd className="text-gray-900">{formatDate(patientDetails.start_date)}</dd>
                      </dl>
                    </div>
                  )}

                  {!patientDetails && (
                    <p className="text-sm text-gray-400 italic">No lead contact details recorded yet.</p>
                  )}
                </div>
              )}

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
                    <dt className="text-gray-500">Proposal Sent</dt>
                    <dd>
                      <input
                        type="date"
                        defaultValue={lead.proposal_sent_date ?? ''}
                        disabled={isConverted}
                        onBlur={e => {
                          const val = e.target.value || null
                          if (val !== (lead.proposal_sent_date ?? null)) {
                            startTransition(async () => {
                              await updateLead(lead.id, { proposalSentDate: val })
                              router.refresh()
                            })
                          }
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                      />
                    </dd>
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
                    disabled={isPending || isConverted}
                    className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                  >
                    {activeStages.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${stageColorMap[lead.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                    {activeStages.find(s => s.key === lead.stage)?.label ?? lead.stage}
                  </span>
                  {lead.stage === 'retainer' && !isConverted && (
                    <button
                      type="button"
                      onClick={() => setCollectRetainerOpen(true)}
                      className="px-3 py-1 text-xs font-medium bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors"
                    >
                      Collect Retainer
                    </button>
                  )}
                </div>
                {context.canAssign && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Lead Owner</label>
                    <select
                      value={lead.lead_owner_id ?? ''}
                      onChange={e => {
                        startTransition(async () => {
                          await updateLead(lead.id, { leadOwnerId: e.target.value || null })
                          router.refresh()
                        })
                      }}
                      disabled={isPending || isConverted}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {owners.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name ?? ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Conversion */}
              {context.conversionAction && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Conversion</h3>
                  {lead.converted_agency_id && lead.converted_agency && lead.converted_at ? (
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
                  ) : lead.converted_agency_id && lead.converted_agency && !lead.converted_at ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-blue-700">Associated Agency</p>
                      <a
                        href={`/pages/admin/agencies/${lead.converted_agency.id}`}
                        className="flex items-center gap-1.5 text-sm text-blue-800 font-medium hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {lead.converted_agency.name}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {(currentUserRole === 'admin' || currentUserRole === 'expert') && (
                        <button
                          type="button"
                          disabled={unlinking}
                          onClick={async () => {
                            setUnlinking(true)
                            await unlinkLeadFromAgency(lead.id)
                            setUnlinking(false)
                            router.refresh()
                          }}
                          className="text-xs text-blue-500 hover:text-blue-700 transition-colors disabled:opacity-50"
                        >
                          {unlinking ? 'Removing…' : 'Remove link'}
                        </button>
                      )}
                    </div>
                  ) : lead.converted_client_id ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-green-700">Converted to client</p>
                      <button
                        type="button"
                        onClick={() => router.push(`/pages/agency/clients/${lead.converted_client_id}`)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800 hover:underline"
                      >
                        Open client
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
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
                                No agency name on this lead. Enter the agency name to continue.
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
                      ) : (() => {
                        const wonStage = stages?.find(s => s.is_won)
                        const atWonStage = !wonStage || lead.stage === wonStage.key
                        return atWonStage ? (
                          <button
                            type="button"
                            onClick={() => setConvertClientOpen(true)}
                            className="block w-full px-3 py-2 text-sm font-medium text-center text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                          >
                            {context.conversionLabel}
                          </button>
                        ) : (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                            Move this lead to <span className="font-semibold text-gray-700">{wonStage.label}</span> before converting to a client.
                          </div>
                        )
                      })()}
                      <p className="mt-2 text-xs text-gray-400">
                        {context.conversionAction === 'agency'
                          ? 'Creates a shell agency record.'
                          : 'Creates an Intake client and preserves this lead history.'}
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
                    <dd className={`font-medium ${lead.status === 'archived' || isConverted ? 'text-gray-400' : 'text-green-600'}`}>
                      {lead.status === 'archived' || isConverted ? 'Archived' : 'Active'}
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
                {lead.status === 'active' && !isConverted && (
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
            {!isConverted && (
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
                          ? 'bg-gray-200 text-gray-700'
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
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={addingNote || !newNoteContent.trim()}
                    loading={addingNote}
                  >
                    {addingNote ? 'Saving…' : 'Save Note'}
                  </Button>
                </div>
                </form>
              </div>
            )}

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
                        ? 'bg-gray-200 text-gray-700'
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
                            <Badge
                              label={NOTE_TYPES.find(nt => nt.key === note.note_type)?.label ?? note.note_type}
                              color={NOTE_TYPE_COLOR[note.note_type] ?? 'gray'}
                            />
                            <span className="text-xs text-gray-400">{note.author?.full_name ?? 'Unknown'}</span>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-400">{relativeTime(note.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                        </div>
                        {!isConverted && (
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                            aria-label="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
            {!isConverted && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Task</h3>
                <form onSubmit={handleAddTask} className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_10rem_13rem_auto]">
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Task title…"
                  className={`${inputCls} min-w-0`}
                  required
                />
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={e => setNewTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none cursor-pointer"
                  title="Due date"
                />
                <select
                  value={newTaskAssignee}
                  onChange={e => setNewTaskAssignee(e.target.value)}
                  className={inputCls}
                  aria-label="Assign new task to"
                >
                  <option value="">Unassigned</option>
                  {owners.map(owner => (
                    <option key={owner.id} value={owner.id}>{owner.full_name || 'Unnamed user'}</option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  type="submit"
                  icon={Plus}
                  disabled={addingTask || !newTaskTitle.trim()}
                  loading={addingTask}
                  className="flex-shrink-0"
                />
                </form>
                {taskError && <p className="mt-2 text-xs text-red-600">{taskError}</p>}
              </div>
            )}

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
                    const overdue = !isConverted && isOverdue(task)
                    const dueToday = !isConverted && isDueToday(task)
                    return (
                      <li
                        key={task.id}
                        className={`px-5 py-3.5 flex items-center gap-3 ${overdue ? 'border-l-2 border-red-400' : dueToday ? 'border-l-2 border-orange-400' : ''}`}
                      >
                        {isConverted ? (
                          <Square className="w-[18px] h-[18px] flex-shrink-0 text-gray-300" aria-hidden />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleTask(task)}
                            className="flex-shrink-0 text-gray-400 hover:text-green-600 transition-colors"
                            aria-label={`Complete task: ${task.title}`}
                          >
                            <Square className="w-[18px] h-[18px]" />
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">{task.title}</p>
                          {task.due_date && (
                            <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-medium' : dueToday ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                              {overdue ? 'Overdue · ' : dueToday ? 'Due today · ' : 'Due '}
                              {formatDate(task.due_date)}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-gray-500">
                            Assigned to {task.assignee?.full_name || 'Unassigned'}
                            {task.creator?.full_name ? ` · Created by ${task.creator.full_name}` : ''}
                          </p>
                        </div>
                        {!isConverted && (
                          <>
                            <select
                              value={task.assigned_to ?? ''}
                              onChange={e => handleTaskAssigneeChange(task.id, e.target.value)}
                              className="max-w-48 rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                              aria-label={`Assign task: ${task.title}`}
                            >
                              <option value="">Unassigned</option>
                              {owners.map(owner => (
                                <option key={owner.id} value={owner.id}>{owner.full_name || 'Unnamed user'}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task.id)}
                              className="flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                              aria-label={`Delete task: ${task.title}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
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
                        {isConverted ? (
                          <CheckSquare className="w-[18px] h-[18px] flex-shrink-0 text-green-500" aria-hidden />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleTask(task)}
                            className="flex-shrink-0 text-green-500 hover:text-gray-400 transition-colors"
                            aria-label={`Reopen task: ${task.title}`}
                          >
                            <CheckSquare className="w-[18px] h-[18px]" />
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 line-through">{task.title}</p>
                          {task.completed_at && (
                            <p className="text-xs text-gray-400 mt-0.5">Completed {relativeTime(task.completed_at)}</p>
                          )}
                          <p className="mt-0.5 text-xs text-gray-400">
                            Assigned to {task.assignee?.full_name || 'Unassigned'}
                            {task.creator?.full_name ? ` · Created by ${task.creator.full_name}` : ''}
                          </p>
                        </div>
                        {!isConverted && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="flex-shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                            aria-label={`Delete task: ${task.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Documents Tab ──────────────────────────────────────────── */}
        {tab === 'documents' && (
          <LeadDocumentsTab
            leadId={lead.id}
            initialDocuments={documents}
            canUpload={
              !isConverted && (
                currentUserRole === 'admin'
              || currentUserRole === 'expert'
              || currentUserRole === 'company_owner'
              || currentUserRole === 'care_coordinator'
              )
            }
          />
        )}
      </div>

      <AddLeadModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={() => { setEditOpen(false); router.refresh() }}
        context={context}
        editLead={lead}
      />

      {context.leadType === 'patient' && (
        <EditPatientLeadDetailsModal
          isOpen={editPatientDetailsOpen}
          onClose={() => setEditPatientDetailsOpen(false)}
          onSuccess={() => router.refresh()}
          leadId={lead.id}
          details={patientDetails}
        />
      )}

      {context.leadType === 'patient' && (
        <AddNewClientModal
          isOpen={convertClientOpen}
          onClose={() => setConvertClientOpen(false)}
          conversionLeadId={lead.id}
          prefill={{
            firstName: lead.contact_first_name ?? '', lastName: lead.contact_last_name ?? '',
            email: lead.contact_email ?? '', phone: lead.contact_phone ?? '',
            streetAddress: [lead.contact_address1, lead.contact_address2].filter(Boolean).join(', '),
            city: lead.contact_city ?? '', state: lead.contact_state ?? '', zipCode: lead.contact_zip ?? '',
          }}
          onSuccess={(patient) => {
            setConvertClientOpen(false)
            if (patient?.id) router.push(`/pages/agency/clients/${String(patient.id)}`)
            else router.refresh()
          }}
        />
      )}

      <LeadSignedModal
        lead={lead}
        open={signedPromptOpen}
        onClose={() => setSignedPromptOpen(false)}
        onSuccess={(stage) => {
          setSignedPromptOpen(false)
          if (stage === 'signed' && lead.lead_type === 'agency' && !lead.converted_agency_id) {
            setShowConvertPrompt(true)
          } else {
            router.refresh()
          }
        }}
      />
      <LeadCollectRetainerModal
        leadId={lead.id}
        open={collectRetainerOpen}
        onClose={() => setCollectRetainerOpen(false)}
        onSuccess={() => {
          setCollectRetainerOpen(false)
          if (lead.lead_type === 'agency' && !lead.converted_agency_id) {
            setShowConvertPrompt(true)
          } else {
            router.refresh()
          }
        }}
      />
      <ConvertToAgencyPromptModal
        open={showConvertPrompt}
        lead={lead}
        onClose={() => { setShowConvertPrompt(false); router.refresh() }}
      />
    </>
  )
}
