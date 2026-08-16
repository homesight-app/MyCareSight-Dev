'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CheckCircle2, Clock, AlertCircle, Circle,
  FileText, Loader2, ChevronRight, CalendarDays,
  Download, Send, Info, SquarePen, CheckCheck,
  MessageSquare, FolderOpen, Pencil, Check, X, Plus, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'
import {
  getProgramItemNoteCounts,
  updateProgramItem,
} from '@/app/actions/playbooks'
import { approveProgramComplete, renameApplication, closeApplicationManually, completeApplicationManually, reopenApplication } from '@/app/actions/applications'
import { linkProgramToCertification } from '@/app/actions/licenses'
import ProgramItemDetailModal from './ProgramItemDetailModal'
import AddProgramItemModal from './AddProgramItemModal'
import InternalNotesPanel from './InternalNotesPanel'
import CreateLicenseModal from './CreateLicenseModal'
import Modal from './Modal'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'items' | 'documents' | 'notes'
type TabId = 'overview' | 'documents' | 'validation' | 'notes' | 'history'
type Status = ApplicationPlaybookItem['status']

interface LinkedCertRow {
  id: string
  link_type: string
  linked_at: string
  licenses: { id: string; license_name: string; license_number: string | null; status: string; expiry_date: string | null; agency_id: string } | null
}

interface PlaybookTemplate {
  id: string
  template_name: string
  description: string | null
  file_url: string
  file_name: string
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; dot: string }> = {
  not_started:    { label: 'Not Started',   color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
  in_progress:    { label: 'In Progress',   color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  review_needed:  { label: 'Review Needed', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  approved:       { label: 'Approved',      color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  applicationId: string
  applicationName: string
  state: string
  status: string
  agencyId: string | null
  agencyName: string | null
  categoryName?: string | null
  subcategoryName?: string | null
  playbookId: string | null
  initialItems: ApplicationPlaybookItem[]
  isAdmin?: boolean
  closedAt?: string | null
  closeReason?: string | null
  completedAt?: string | null
  completeReason?: string | null
}

export default function ExpertProgramView({
  applicationId,
  applicationName,
  state,
  status,
  agencyId,
  agencyName,
  categoryName,
  subcategoryName,
  playbookId,
  initialItems,
  isAdmin = false,
  closedAt,
  closeReason,
  completedAt,
  completeReason,
}: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = createClient()

  // ── Name editing ─────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(applicationName)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(applicationName)
  const [nameSaving, setNameSaving] = useState(false)

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === displayName) { setEditingName(false); setNameDraft(displayName); return }
    setNameSaving(true)
    await renameApplication(applicationId, trimmed)
    setDisplayName(trimmed)
    setEditingName(false)
    setNameSaving(false)
  }

  const handleCancelName = () => { setNameDraft(displayName); setEditingName(false) }

  // ── Manual status ─────────────────────────────────────────────────────────────
  const handleManualStatusConfirm = async () => {
    if (!manualStatusReason.trim() || isManualStatusLoading) return
    setIsManualStatusLoading(true)
    try {
      let error: string | null = null
      if (manualStatusModal === 'close')         ({ error } = await closeApplicationManually(applicationId, manualStatusReason.trim()))
      else if (manualStatusModal === 'complete') ({ error } = await completeApplicationManually(applicationId, manualStatusReason.trim()))
      else if (manualStatusModal === 'reopen')   ({ error } = await reopenApplication(applicationId, manualStatusReason.trim()))
      if (error) { alert(error); return }
      const now = new Date().toISOString()
      const reason = manualStatusReason.trim()
      if (manualStatusModal === 'close')         { setCurrentStatus('closed');      setDisplayedClosedAt(now);     setDisplayedCloseReason(reason)    }
      else if (manualStatusModal === 'complete') { setCurrentStatus('under_review'); setDisplayedCompletedAt(now);  setDisplayedCompleteReason(reason) }
      else if (manualStatusModal === 'reopen')   { setCurrentStatus('in_progress'); setDisplayedClosedAt(null);    setDisplayedCloseReason(null);     setDisplayedCompletedAt(null); setDisplayedCompleteReason(null) }
      setManualStatusModal(null)
      setManualStatusReason('')
    } finally {
      setIsManualStatusLoading(false)
    }
  }

  // ── Linked certifications ─────────────────────────────────────────────────────
  const refreshLinkedCerts = useCallback(async () => {
    setLinkedCertsLoading(true)
    const { data } = await supabase
      .from('certification_applications')
      .select('id, link_type, linked_at, licenses ( id, license_name, license_number, status, expiry_date, agency_id )')
      .eq('application_id', applicationId)
      .order('linked_at', { ascending: false })
    setLinkedCerts((data as unknown as LinkedCertRow[]) ?? [])
    setLinkedCertsLoading(false)
  }, [applicationId, supabase])

  useEffect(() => { refreshLinkedCerts() }, [refreshLinkedCerts])

  const openLinkCertModal = async () => {
    setSelectedCertId('')
    setSelectedLinkType('renewal_of')
    setLinkCertModal(true)
    if (!agencyId) return
    setAvailableCertsLoading(true)
    const excludeIds = linkedCerts.map(r => r.licenses?.id).filter((id): id is string => !!id)
    let query = supabase.from('licenses').select('id, license_name, license_number, status').eq('agency_id', agencyId).order('license_name')
    if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`)
    const { data } = await query
    setAvailableCerts((data ?? []) as typeof availableCerts)
    setAvailableCertsLoading(false)
  }

  const handleLinkCert = async () => {
    if (!selectedCertId || !agencyId) return
    setIsLinkingCert(true)
    const { error } = await linkProgramToCertification(selectedCertId, applicationId, agencyId, selectedLinkType)
    setIsLinkingCert(false)
    if (error) { alert(error); return }
    setLinkCertModal(false)
    refreshLinkedCerts()
  }


  // ── Tab ───────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('items')
  const activeTabRef = useRef<Tab>('items')
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // ── Header modals (messages + templates) ─────────────────────────────────────
  const [isMessagesOpen, setIsMessagesOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const isMessagesOpenRef = useRef(false)
  useEffect(() => { isMessagesOpenRef.current = isMessagesOpen }, [isMessagesOpen])

  // ── Items ─────────────────────────────────────────────────────────────────────
  const [items, setItems] = useState(initialItems)
  const isFirstPctWrite = useRef(true)

  // ── Application status (reactive — auto-transitions when all items complete) ──
  const [currentStatus, setCurrentStatus] = useState(status)
  const [isApprovingProgram, setIsApprovingProgram] = useState(false)

  // ── Manual status (close / complete / reopen) ─────────────────────────────────
  const [manualStatusModal, setManualStatusModal] = useState<'close' | 'complete' | 'reopen' | null>(null)
  const [manualStatusReason, setManualStatusReason] = useState('')
  const [isManualStatusLoading, setIsManualStatusLoading] = useState(false)
  const [displayedClosedAt, setDisplayedClosedAt] = useState(closedAt ?? null)
  const [displayedCloseReason, setDisplayedCloseReason] = useState(closeReason ?? null)
  const [displayedCompletedAt, setDisplayedCompletedAt] = useState(completedAt ?? null)
  const [displayedCompleteReason, setDisplayedCompleteReason] = useState(completeReason ?? null)

  // ── Linked certifications ─────────────────────────────────────────────────────
  const [linkedCerts, setLinkedCerts] = useState<LinkedCertRow[]>([])
  const [linkedCertsLoading, setLinkedCertsLoading] = useState(true)
  const [linkCertModal, setLinkCertModal] = useState(false)
  const [availableCerts, setAvailableCerts] = useState<{ id: string; license_name: string; license_number: string | null; status: string }[]>([])
  const [availableCertsLoading, setAvailableCertsLoading] = useState(false)
  const [selectedCertId, setSelectedCertId] = useState('')
  const [selectedLinkType, setSelectedLinkType] = useState<'created_from' | 'renewal_of'>('renewal_of')
  const [isLinkingCert, setIsLinkingCert] = useState(false)
  const [createCertModal, setCreateCertModal] = useState(false)

  useEffect(() => {
    if (items.length === 0) return
    const allComplete = items.every(i => i.status === 'approved')
    if (allComplete && (currentStatus === 'in_progress' || currentStatus === 'approved')) {
      setCurrentStatus('under_review')
    }
  }, [items, currentStatus])

  // ── Filter ────────────────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState<'all' | 'required' | 'optional'>('all')
  const [filterAssignment, setFilterAssignment] = useState<'all' | 'client' | 'expert' | 'both'>('all')

  // ── Notes ─────────────────────────────────────────────────────────────────────
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [modalItem, setModalItem] = useState<ApplicationPlaybookItem | null>(null)
  const [modalDefaultTab, setModalDefaultTab] = useState<TabId>('notes')

  // ── Selected doc item (inline detail) ────────────────────────────────────────
  const [selectedDocItem, setSelectedDocItem] = useState<ApplicationPlaybookItem | null>(null)

  // ── Add item modal ────────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false)
  const [addItemDefaultType, setAddItemDefaultType] = useState<'step' | 'document'>('step')

  // ── Due date editing ──────────────────────────────────────────────────────────
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null)
  const [savingDueDateId, setSavingDueDateId] = useState<string | null>(null)

  const handleDueDateChange = async (itemId: string, value: string) => {
    setSavingDueDateId(itemId)
    const due = value || null
    await updateProgramItem(itemId, { due_date: due })
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, due_date: due } : i))
    setEditingDueDateId(null)
    setSavingDueDateId(null)
  }


  // ── Templates ─────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<PlaybookTemplate[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)

  // ── Messages ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<any[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const [messageContent, setMessageContent] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Split by item type ────────────────────────────────────────────────────────
  const stepItems = items.filter(i => i.item_type !== 'document')
  const docItems  = items.filter(i => i.item_type === 'document')

  // ── Progress ──────────────────────────────────────────────────────────────────
  const approved        = items.filter(i => i.status === 'approved').length
  const inProgress      = items.filter(i => i.status === 'in_progress').length
  const reviewNeeded    = stepItems.filter(i => i.status === 'review_needed').length
  const docReviewNeeded = docItems.filter(i => i.status === 'review_needed').length
  const notStarted      = items.filter(i => i.status === 'not_started').length
  const pct             = items.length > 0 ? Math.round((approved / items.length) * 100) : 0

  // Persist pct to the applications table so the client view always shows the same value
  useEffect(() => {
    if (isFirstPctWrite.current) { isFirstPctWrite.current = false; return }
    supabase.from('applications').update({ progress_percentage: pct }).eq('id', applicationId).then(() => {})
  }, [pct])

  // ── Filtered visible step items ───────────────────────────────────────────────
  const visible = stepItems.filter(i => {
    if (filterType !== 'all' && i.requirement_type !== filterType) return false
    if (filterAssignment !== 'all' && i.assignment !== filterAssignment) return false
    return true
  })


  // ── Note counts ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (items.length === 0) return
    getProgramItemNoteCounts(items.map(i => i.id)).then(setNoteCounts)
  }, [items])

  // ── Current user ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase])

  // ── Templates ─────────────────────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    if (!playbookId) { setTemplates([]); return }
    setIsLoadingTemplates(true)
    try {
      const { data } = await supabase
        .from('playbook_templates')
        .select('id, template_name, description, file_url, file_name')
        .eq('playbook_id', playbookId)
        .order('template_name', { ascending: true })
      setTemplates((data ?? []) as PlaybookTemplate[])
    } catch {
      setTemplates([])
    } finally {
      setIsLoadingTemplates(false)
    }
  }, [playbookId, supabase])

  useEffect(() => {
    if (isTemplatesOpen) fetchTemplates()
  }, [isTemplatesOpen, fetchTemplates])

  // ── Conversation setup ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return
    const setup = async () => {
      setIsLoadingConversation(true)
      try {
        const { data: existing } = await q.getConversationByApplicationId(supabase, applicationId)
        let convId = existing?.id ?? null

        if (!convId) {
          const { data: created, error: cErr } = await q.insertConversation(supabase, {
            client_id: null,
            application_id: applicationId,
          })
          if (cErr?.code === '23505') {
            const { data: retried } = await q.getConversationByApplicationId(supabase, applicationId)
            convId = retried?.id ?? null
          } else {
            convId = created?.id ?? null
          }
        }

        setConversationId(convId)
        if (!convId) return

        const { data: msgs } = await q.getMessagesByConversationId(supabase, convId)
        if (!msgs?.length) return

        const senderIds = Array.from(new Set(msgs.map((m: any) => m.sender_id))) as string[]
        const { data: profiles } = senderIds.length > 0
          ? await q.getUserProfilesByIds(supabase, senderIds)
          : { data: [] }

        const byId: Record<string, any> = {}
        ;(profiles ?? []).forEach((p: any) => { byId[p.id] = p })

        const enriched = msgs.map((m: any) => ({
          ...m,
          sender: { id: m.sender_id, user_profiles: byId[m.sender_id] ?? null },
          is_own: m.sender_id === currentUserId,
        }))
        setMessages(enriched)

        const unread = enriched.filter((m: any) =>
          !m.is_own && (!Array.isArray(m.is_read) || !m.is_read.includes(currentUserId))
        )
        if (!isMessagesOpenRef.current) setUnreadCount(unread.length)
        if (unread.length > 0) {
          const ids = unread.map((m: any) => m.id).filter(Boolean) as string[]
          if (ids.length) await q.rpcMarkMessagesAsReadByUser(supabase, ids, currentUserId!)
        }
      } catch { /* silent */ } finally {
        setIsLoadingConversation(false)
      }
    }
    setup()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, applicationId])

  // ── Real-time subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !currentUserId) return
    const channel = supabase
      .channel(`expert-program-msgs:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const msg = payload.new as any
          const { data: profiles } = await q.getUserProfilesByIds(supabase, [msg.sender_id])
          const enriched = {
            ...msg,
            sender: { id: msg.sender_id, user_profiles: profiles?.[0] ?? null },
            is_own: msg.sender_id === currentUserId,
          }
          setMessages(prev => {
            if (prev.some(m => m.id === enriched.id)) return prev
            return [...prev, enriched].sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
          })
          if (!enriched.is_own && !isMessagesOpenRef.current) {
            setUnreadCount(c => c + 1)
          }
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId])

  useEffect(() => {
    if (messages.length > 0) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──────────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!messageContent.trim() || isSendingMessage || !currentUserId) return
    setIsSendingMessage(true)
    try {
      let convId = conversationId
      if (!convId) {
        const { data: existing } = await q.getConversationByApplicationId(supabase, applicationId)
        convId = existing?.id ?? null
        if (!convId) {
          const { data: created } = await q.insertConversation(supabase, { client_id: null, application_id: applicationId })
          convId = created?.id ?? null
        }
        setConversationId(convId)
      }
      if (!convId) return
      const { data: profiles } = await q.getUserProfilesByIds(supabase, [currentUserId])
      const { data: newMsg } = await q.insertMessage(supabase, {
        conversation_id: convId,
        sender_id: currentUserId,
        content: messageContent.trim(),
      })
      if (newMsg) {
        setMessages(prev => [...prev, {
          ...newMsg,
          is_read: [currentUserId],
          sender: { id: currentUserId, user_profiles: profiles?.[0] ?? null },
          is_own: true,
        }])
      }
      await q.updateConversationLastMessageAt(supabase, convId)
      setMessageContent('')
    } catch { /* silent */ } finally {
      setIsSendingMessage(false)
    }
  }

  // ── Message helpers ───────────────────────────────────────────────────────────
  const getSenderName = (msg: any) => {
    if (msg.sender?.user_profiles?.full_name) return msg.sender.user_profiles.full_name
    const role = msg.sender?.user_profiles?.role
    if (role === 'expert') return 'Expert'
    if (role === 'admin') return 'Admin'
    return 'Owner'
  }
  const getSenderRole = (msg: any) => {
    const r = msg.sender?.user_profiles?.role
    if (r === 'expert') return 'Expert'
    if (r === 'admin') return 'Admin'
    return 'Owner'
  }
  const getInitials = (name: string) =>
    name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const getRoleTagColor = (role: string) => {
    if (role === 'Expert') return 'bg-blue-100 text-blue-700 border-blue-200'
    if (role === 'Admin')  return 'bg-green-100 text-green-700 border-green-200'
    return 'bg-purple-100 text-purple-700 border-purple-200'
  }
  const formatMessageTime = (dt: string) => {
    const d = new Date(dt)
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }

  // ── App status badge ──────────────────────────────────────────────────────────
  const getAppBadge = (s: string) => {
    switch (s) {
      case 'in_progress':    return { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'In Progress' }
      case 'under_review':   return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Under Review' }
      case 'needs_revision': return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Needs Revision' }
      case 'approved':       return { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved' }
      case 'closed':         return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Closed' }
      case 'complete':       return { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'Complete' }
      default:               return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: s }
    }
  }
  const appBadge = getAppBadge(currentStatus)
  const isTerminal = currentStatus === 'approved' || currentStatus === 'rejected'
  const canReopen = currentStatus === 'closed' || currentStatus === 'complete'
  const canClose = !isTerminal && !canReopen && currentStatus !== 'under_review'

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'items',     label: 'Next Steps', badge: reviewNeeded + inProgress || undefined },
    { id: 'documents', label: 'Documents',  badge: docReviewNeeded || undefined },
    { id: 'notes',     label: 'Notes' },
  ]

  // ═══════════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {editingName ? (
                <>
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelName() }}
                    disabled={nameSaving}
                    className="text-lg font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent min-w-0"
                  />
                  <button onClick={handleSaveName} disabled={nameSaving || !nameDraft.trim()} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50 flex-shrink-0" title="Save"><Check className="w-4 h-4" /></button>
                  <button onClick={handleCancelName} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0" title="Cancel"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <div className="flex items-center gap-1 group">
                  <h1 className="text-lg font-bold text-gray-900 truncate">{displayName}</h1>
                  {isAdmin && (
                    <button onClick={() => { setNameDraft(displayName); setEditingName(true) }} className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="Edit name"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              )}
              {agencyName && <span className="text-gray-400 text-sm hidden sm:inline">·</span>}
              {agencyName && (
                agencyId ? (
                  <Link
                    href={isAdmin ? `/pages/admin/agencies/${agencyId}` : `/pages/expert/agencies/${agencyId}`}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                  >
                    {agencyName}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-500">{agencyName}</span>
                )
              )}
              {state && <span className="text-gray-400 text-sm hidden sm:inline">·</span>}
              {state && <span className="text-sm text-gray-500">{state}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${appBadge.bg} ${appBadge.text}`}>
                {appBadge.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">{`PRG-${applicationId.substring(0, 8).toUpperCase()}`}</p>
              {categoryName && (
                <>
                  <span className="text-gray-300 text-xs">·</span>
                  <span className="text-xs text-gray-500">{categoryName}</span>
                </>
              )}
              {subcategoryName && (
                <>
                  <span className="text-gray-300 text-xs">›</span>
                  <span className="text-xs text-gray-500">{subcategoryName}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm font-semibold text-gray-700 w-9 text-right">{pct}%</span>
            </div>
            <button
              onClick={() => setIsTemplatesOpen(true)}
              title="Templates"
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
            <button
              onClick={() => { setIsMessagesOpen(true); setUnreadCount(0) }}
              title="Messages"
              className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MessageSquare className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {isAdmin && currentStatus === 'under_review' && (
              <button
                onClick={async () => {
                  setIsApprovingProgram(true)
                  const { error } = await approveProgramComplete(applicationId)
                  setIsApprovingProgram(false)
                  if (!error) setCurrentStatus('closed')
                }}
                disabled={isApprovingProgram}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isApprovingProgram
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCheck className="w-4 h-4" />}
                Approve Program
              </button>
            )}
            {canClose && (
              <>
                <button
                  type="button"
                  onClick={() => { setManualStatusModal('complete'); setManualStatusReason('') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Complete
                </button>
                <button
                  type="button"
                  onClick={() => { setManualStatusModal('close'); setManualStatusReason('') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Close
                </button>
              </>
            )}
            {canReopen && (
              <button
                type="button"
                onClick={() => { setManualStatusModal('reopen'); setManualStatusReason('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Re-open
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Status banners (closed / complete) ── */}
      {currentStatus === 'closed' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
          <X className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-gray-700">Program Closed</p>
            {displayedClosedAt && <p className="text-sm text-gray-500">{new Date(displayedClosedAt).toLocaleDateString()}</p>}
            {displayedCloseReason && <p className="text-sm text-gray-600 mt-1">{displayedCloseReason}</p>}
          </div>
        </div>
      )}
      {currentStatus === 'complete' && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-teal-700">Program Marked Complete</p>
            {displayedCompletedAt && <p className="text-sm text-teal-600">{new Date(displayedCompletedAt).toLocaleDateString()}</p>}
            {displayedCompleteReason && <p className="text-sm text-teal-700 mt-1">{displayedCompleteReason}</p>}
          </div>
        </div>
      )}

      {/* ── Linked Certifications ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Linked Certifications</h3>
          {agencyId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openLinkCertModal}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Link to Existing
              </button>
              <button
                type="button"
                onClick={() => setCreateCertModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-800 px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Create New Certification
              </button>
            </div>
          )}
        </div>
        {linkedCertsLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
        ) : linkedCerts.length === 0 ? (
          <p className="text-xs text-gray-400">No certifications linked to this program yet.</p>
        ) : (
          <div className="space-y-2">
            {linkedCerts.map(row => {
              const cert = row.licenses
              if (!cert) return null
              const certHref = isAdmin ? `/pages/admin/agencies/${cert.agency_id}` : `/pages/expert/agencies/${cert.agency_id}`
              return (
                <div key={row.id} className="flex items-center gap-3 text-sm">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cert.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {cert.status}
                  </span>
                  <Link href={certHref} className="text-blue-600 hover:underline font-medium text-xs flex-1 truncate">
                    {cert.license_name}{cert.license_number ? ` · #${cert.license_number}` : ''}
                  </Link>
                  <span className="text-xs text-gray-400 capitalize flex-shrink-0">{row.link_type.replace(/_/g, ' ')}</span>
                  {cert.expiry_date && (
                    <span className="text-xs text-gray-400 flex-shrink-0">Exp: {new Date(cert.expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Tab navigation ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 -mt-2">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4 px-6 overflow-x-auto" aria-label="Tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.badge && tab.badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs font-semibold leading-none">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          ITEMS TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'items' && (
        <div>
          {/* Progress summary */}


          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
              {(['all', 'required', 'optional'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1.5 capitalize transition-colors ${
                    filterType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t === 'all'
                    ? `All (${stepItems.length})`
                    : `${t.charAt(0).toUpperCase() + t.slice(1)} (${stepItems.filter(i => i.requirement_type === t).length})`
                  }
                </button>
              ))}
            </div>
            <select
              value={filterAssignment}
              onChange={e => setFilterAssignment(e.target.value as typeof filterAssignment)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Assignments</option>
              <option value="client">Client</option>
              <option value="expert">Expert</option>
              <option value="both">Both</option>
            </select>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => { setAddItemDefaultType('step'); setShowAddModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Step
              </button>
              <button
                onClick={() => { setAddItemDefaultType('document'); setShowAddModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Document
              </button>
            </div>
          </div>

          {/* Step items list */}
          {stepItems.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">No step items in this program yet</p>
              <p className="text-sm text-gray-500">Items will appear here once the playbook is applied to this application.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[2rem_1fr_6rem_9rem_7rem_2rem] gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-medium text-gray-400">#</span>
                <span className="text-xs font-medium text-gray-500">Item</span>
                <span className="text-xs font-medium text-gray-500">Type</span>
                <span className="text-xs font-medium text-gray-500">Status</span>
                <span className="text-xs font-medium text-gray-500">Due Date</span>
                <span />
              </div>

              {visible.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-500">No items match the current filters.</div>
              )}

              {visible.map(item => {
                const statusCfg = STATUS_CONFIG[item.status]
                const isDocument = item.item_type === 'document'

                return (
                  <div key={item.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Main row — click opens overview modal */}
                    <div
                      className="grid grid-cols-[2rem_1fr_6rem_9rem_7rem_2rem] gap-2 px-4 py-3 items-center transition-colors hover:bg-gray-50 cursor-pointer"
                      onClick={() => { setModalItem(item); setModalDefaultTab('overview') }}
                    >
                      <span className="text-xs font-mono text-gray-400">{item.item_order}</span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-gray-900 truncate font-medium">{item.name}</p>
                          {item.description && (
                            <div className="relative group flex-shrink-0">
                              <div className="w-4 h-4 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center cursor-help">
                                <Info className="w-2.5 h-2.5 text-blue-600" />
                              </div>
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 hidden group-hover:block z-50 shadow-xl pointer-events-none">
                                {item.description}
                                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-gray-900" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-xs font-medium px-1.5 py-0 rounded ${
                            isDocument ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {isDocument ? 'Document' : 'Step'}
                          </span>
                          <span className="text-xs px-1.5 py-0 rounded bg-gray-100 text-gray-500">
                            {item.assignment}
                          </span>
                          {item.phase && <span className="text-xs text-gray-400">{item.phase}</span>}
                        </div>
                      </div>

                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit capitalize ${
                        item.requirement_type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {item.requirement_type}
                      </span>

                      <div>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${statusCfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </div>

                      {editingDueDateId === item.id ? (
                        <input
                          type="date"
                          autoFocus
                          defaultValue={item.due_date ?? ''}
                          disabled={savingDueDateId === item.id}
                          onChange={e => handleDueDateChange(item.id, e.target.value)}
                          onBlur={e => { if (savingDueDateId !== item.id) { handleDueDateChange(item.id, e.target.value) } }}
                          onKeyDown={e => { if (e.key === 'Escape') setEditingDueDateId(null) }}
                          onClick={e => e.stopPropagation()}
                          className="text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
                        />
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingDueDateId(item.id) }}
                          className="text-xs text-gray-500 flex items-center gap-1 hover:text-blue-600 transition-colors"
                          title="Set due date"
                        >
                          <CalendarDays className="w-3 h-3 flex-shrink-0" />
                          {item.due_date ?? '—'}
                        </button>
                      )}

                      <button
                        onClick={e => { e.stopPropagation(); setModalItem(item); setModalDefaultTab('notes') }}
                        className="relative p-1 rounded transition-colors text-gray-400 hover:text-blue-700 flex justify-center"
                        title="View notes"
                      >
                        <SquarePen className="w-4 h-4" />
                        {(noteCounts[item.id] ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                            {noteCounts[item.id]}
                          </span>
                        )}
                      </button>
                    </div>

                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Item notes modal ── */}
      {modalItem && (
        <ProgramItemDetailModal
          item={modalItem}
          agencyId={agencyId}
          isStaff
          defaultTab={modalDefaultTab}
          onClose={async () => {
            setModalItem(null)
            setNoteCounts(await getProgramItemNoteCounts(items.map(i => i.id)))
          }}
          onItemUpdated={updated => {
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
          }}
        />
      )}

      {/* ── Document item popup modal ── */}
      {selectedDocItem && (
        <ProgramItemDetailModal
          item={selectedDocItem}
          agencyId={agencyId}
          isStaff
          onClose={() => setSelectedDocItem(null)}
          onItemUpdated={updated => {
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
            setSelectedDocItem(updated)
          }}
          size="3xl"
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          NOTES TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'notes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <InternalNotesPanel
            subjectType="application"
            subjectId={applicationId}
            agencyId={agencyId ?? ''}
            canManage
            applicationId={applicationId}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          DOCUMENTS TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <div>
          {docItems.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">No document items in this program yet</p>
              <p className="text-sm text-gray-500">Document items will appear here once the playbook is applied to this application.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {docItems.map(docItem => {
                const statusCfg = STATUS_CONFIG[docItem.status]
                return (
                  <button
                    key={docItem.id}
                    onClick={() => setSelectedDocItem(docItem)}
                    className="w-full flex items-center gap-4 px-4 py-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors text-left"
                  >
                    <FileText className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{docItem.name}</p>
                      {docItem.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{docItem.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${statusCfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Manual Status Modal (Close / Complete / Re-open) */}
      {manualStatusModal && (
        <Modal
          isOpen
          onClose={() => { setManualStatusModal(null); setManualStatusReason('') }}
          title={manualStatusModal === 'close' ? 'Close Program' : manualStatusModal === 'complete' ? 'Mark Program Complete' : 'Re-open Program'}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {manualStatusModal === 'close'
                ? 'Closes the program regardless of task completion. Can be re-opened later if needed.'
                : manualStatusModal === 'complete'
                ? 'Marks all work as done. Can be re-opened if needed.'
                : 'Program will return to In Progress status.'}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {manualStatusModal === 'complete' ? 'Notes' : 'Reason'} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={manualStatusReason}
                onChange={e => setManualStatusReason(e.target.value)}
                rows={3}
                placeholder={manualStatusModal === 'close' ? 'Client decided not to pursue at this time…' : manualStatusModal === 'complete' ? 'All work completed and submitted…' : 'Additional steps needed…'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => { setManualStatusModal(null); setManualStatusReason('') }} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={handleManualStatusConfirm}
                disabled={!manualStatusReason.trim() || isManualStatusLoading}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${manualStatusModal === 'complete' ? 'bg-teal-600 hover:bg-teal-700' : manualStatusModal === 'reopen' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-800'}`}
              >
                {isManualStatusLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {manualStatusModal === 'close' ? 'Close' : manualStatusModal === 'complete' ? 'Mark Complete' : 'Re-open'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Link to Certification Modal */}
      <Modal isOpen={linkCertModal} onClose={() => setLinkCertModal(false)} title="Link to Certification">
        <div className="space-y-4">
          {availableCertsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : availableCerts.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No certifications available to link. Create a new one instead.</p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Certification <span className="text-red-500">*</span></label>
                <select value={selectedCertId} onChange={e => setSelectedCertId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— Select a certification —</option>
                  {availableCerts.map(c => (
                    <option key={c.id} value={c.id}>{c.license_name}{c.license_number ? ` · #${c.license_number}` : ''} ({c.status})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link Type <span className="text-red-500">*</span></label>
                <select value={selectedLinkType} onChange={e => setSelectedLinkType(e.target.value as 'created_from' | 'renewal_of')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="renewal_of">Renewal of this certification</option>
                  <option value="created_from">Created from this program</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setLinkCertModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleLinkCert} disabled={!selectedCertId || isLinkingCert} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                  {isLinkingCert && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Link Certification
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Create New Certification — shared modal */}
      {agencyId && (
        <CreateLicenseModal
          isOpen={createCertModal}
          onClose={() => setCreateCertModal(false)}
          onSuccess={() => { setCreateCertModal(false); refreshLinkedCerts() }}
          agencyId={agencyId}
          lockedProgramId={applicationId}
          defaultLicenseName={displayName}
        />
      )}

      {/* Templates Modal */}
      <Modal isOpen={isTemplatesOpen} onClose={() => setIsTemplatesOpen(false)} title="Document Templates" size="lg">
        <p className="text-sm text-gray-600 mb-4">
          Templates uploaded for this playbook. Clients can download these to complete their requirements.
        </p>
        {!playbookId ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No playbook linked to this program yet. Templates will appear here once a playbook is applied.</p>
          </div>
        ) : isLoadingTemplates ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No templates have been uploaded for this playbook yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(tpl => (
              <div
                key={tpl.id}
                className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900">{tpl.template_name}</h4>
                  {tpl.description && (
                    <p className="text-sm text-gray-600 mt-0.5">{tpl.description}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-1">{tpl.file_name}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (tpl.file_url.startsWith('http')) { window.open(tpl.file_url, '_blank'); return }
                    const { data } = await supabase.storage.from('license-templates').createSignedUrl(tpl.file_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Messages Modal */}
      <Modal isOpen={isMessagesOpen} onClose={() => setIsMessagesOpen(false)} title="Messages" size="lg">
        <div className="space-y-4 mb-4 max-h-[50vh] overflow-y-auto">
          {isLoadingConversation ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">Start a conversation with the agency</p>
            </div>
          ) : (
            <>
              {messages.map(msg => {
                const senderName = getSenderName(msg)
                const senderRole = getSenderRole(msg)
                const initials = getInitials(senderName)
                const roleTagColor = getRoleTagColor(senderRole)
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${msg.is_own ? 'flex-row-reverse' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {initials}
                    </div>
                    <div className={`flex-1 min-w-0 ${msg.is_own ? 'flex flex-col items-end' : ''}`}>
                      <div className={`flex items-center gap-2 mb-1 ${msg.is_own ? 'flex-row-reverse' : ''}`}>
                        <span className="text-sm font-semibold text-gray-900">{senderName}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${roleTagColor}`}>
                          {senderRole}
                        </span>
                        <span className="text-xs text-gray-500">{formatMessageTime(msg.created_at)}</span>
                      </div>
                      <div className={`rounded-lg p-3 ${msg.is_own ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200'}`}>
                        <p className={`text-sm whitespace-pre-wrap ${msg.is_own ? 'text-white' : 'text-gray-900'}`}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div className="border-t border-gray-200 pt-4">
          <div className="flex gap-3">
            <textarea
              value={messageContent}
              onChange={e => setMessageContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() }
              }}
              placeholder="Type your message…"
              rows={2}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageContent.trim() || isSendingMessage || !conversationId}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSendingMessage
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Send className="w-5 h-5" />
              }
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </Modal>

      {showAddModal && (
        <AddProgramItemModal
          isOpen={showAddModal}
          applicationId={applicationId}
          defaultType={addItemDefaultType}
          onClose={() => setShowAddModal(false)}
          onItemAdded={(newItem) => {
            setItems(prev => [...prev, newItem])
            setShowAddModal(false)
          }}
        />
      )}
    </div>
  )
}
