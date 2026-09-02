'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CheckCircle2, Clock, AlertCircle, Circle,
  FileText, Upload, Trash2, Loader2,
  ChevronRight, ChevronDown, CalendarDays,
  Download, Send, Info, MessageSquare, FolderOpen,
} from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import Tabs from '@/components/ui/Tabs'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import UploadDocumentModal from './UploadDocumentModal'
import ProgramItemDetailModal from './ProgramItemDetailModal'
import Modal from './Modal'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'
import {
  submitProgramItem,
  deleteApplicationDocument,
  getProgramItemDocuments,
} from '@/app/actions/playbooks'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'steps' | 'documents'
type Status = ApplicationPlaybookItem['status']

interface ItemDoc {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string | null
  created_at: string
}

interface Template {
  id: string
  template_name: string
  description: string | null
  file_url: string
  file_name: string
}

// ─── Status config — matches ApplicationRequirementsTab exactly ───────────────

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
  licenseTypeId: string | null
  initialItems: ApplicationPlaybookItem[]
  initialPct?: number
}

export default function ClientProgramView({
  applicationId,
  applicationName,
  state,
  status,
  agencyId,
  licenseTypeId,
  initialItems,
  initialPct = 0,
}: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = createClient()

  // ── Tab ───────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('steps')
  const activeTabRef = useRef<Tab>('steps')
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // ── Header modals (messages + templates) ─────────────────────────────────────
  const [isMessagesOpen, setIsMessagesOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const isMessagesOpenRef = useRef(false)
  useEffect(() => { isMessagesOpenRef.current = isMessagesOpen }, [isMessagesOpen])

  // ── Items ─────────────────────────────────────────────────────────────────────
  const [items, setItems] = useState(initialItems)

  // ── Filter ────────────────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState<'all' | 'required' | 'optional'>('all')

  // ── Selected doc item (inline detail) ────────────────────────────────────────
  const [selectedDocItem, setSelectedDocItem] = useState<ApplicationPlaybookItem | null>(null)

  // ── Expand / docs ─────────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [itemDocs, setItemDocs] = useState<Record<string, ItemDoc[]>>({})
  const [loadingDocsFor, setLoadingDocsFor] = useState<string | null>(null)
  const [uploadForItemId, setUploadForItemId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({})

  // ── Templates ─────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([])
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

  // ── Progress % — sourced from DB (written by expert view) so both views match ──
  const [pct, setPct] = useState(initialPct)
  useEffect(() => {
    const channel = supabase
      .channel(`app-progress-${applicationId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications', filter: `id=eq.${applicationId}` },
        (payload) => {
          const val = (payload.new as { progress_percentage?: number }).progress_percentage
          if (typeof val === 'number') setPct(val)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [applicationId])

  // ── Split by item type ────────────────────────────────────────────────────────
  // ── Client-visible items (assignment client or both) ─────────────────────────
  const clientItems     = items.filter(i => i.assignment === 'client' || i.assignment === 'both')
  const clientStepItems = clientItems.filter(i => i.item_type !== 'document')
  const clientDocItems  = clientItems.filter(i => i.item_type === 'document')

  // ── Status badge counts (client-visible items only) ───────────────────────────
  const approved        = clientItems.filter(i => i.status === 'approved').length
  const inProgress      = clientItems.filter(i => i.status === 'in_progress').length
  const reviewNeeded    = clientStepItems.filter(i => i.status === 'review_needed').length
  const docReviewNeeded = clientDocItems.filter(i => i.status === 'review_needed').length
  const notStarted      = clientItems.filter(i => i.status === 'not_started').length

  // ── Filtered visible step items (client-visible only) ────────────────────────
  const visible = clientStepItems.filter(i => {
    if (filterType !== 'all' && i.requirement_type !== filterType) return false
    return true
  })

  // ── Doc helpers ───────────────────────────────────────────────────────────────
  const loadDocsForItem = useCallback(async (itemId: string) => {
    setLoadingDocsFor(itemId)
    const { documents } = await getProgramItemDocuments(itemId)
    setItemDocs(prev => ({ ...prev, [itemId]: documents }))
    setLoadingDocsFor(null)
  }, [])

  const toggleExpand = (itemId: string, isDocument: boolean) => {
    if (expandedId === itemId) {
      setExpandedId(null)
    } else {
      setExpandedId(itemId)
      if (isDocument && !itemDocs[itemId]) loadDocsForItem(itemId)
    }
  }

  const handleSubmit = async (item: ApplicationPlaybookItem) => {
    setSubmitErrors(prev => ({ ...prev, [item.id]: '' }))
    setSubmittingId(item.id)
    const { error } = await submitProgramItem(item.id)
    setSubmittingId(null)
    if (error) {
      setSubmitErrors(prev => ({ ...prev, [item.id]: error }))
    } else {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'in_progress' as Status } : i))
    }
  }

  const handleDeleteDoc = async (itemId: string, doc: ItemDoc) => {
    if (!confirm(`Delete "${doc.document_name}"? This cannot be undone.`)) return
    setDeletingDocId(doc.id)
    await deleteApplicationDocument(doc.id)
    setDeletingDocId(null)
    loadDocsForItem(itemId)
  }

  // ── Current user ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase])

  // ── Templates ─────────────────────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    if (!licenseTypeId) { setTemplates([]); return }
    setIsLoadingTemplates(true)
    try {
      const { data: lt } = await q.getLicenseTypeById(supabase, licenseTypeId)
      if (!lt?.name) { setTemplates([]); return }
      const reqState = (lt as any).state ?? state
      if (!reqState) { setTemplates([]); return }
      const { data: lr } = await q.getLicenseRequirementByStateAndTypeSingle(supabase, reqState, lt.name)
      if (!lr) { setTemplates([]); return }
      const { data: rows } = await q.getRequirementTemplatesForDisplay(supabase, lr.id)
      setTemplates((rows ?? []).map((t: any) => ({
        id: t.id,
        template_name: t.template_name,
        description: t.description ?? null,
        file_url: t.file_url,
        file_name: t.file_name,
      })))
    } catch {
      setTemplates([])
    } finally {
      setIsLoadingTemplates(false)
    }
  }, [licenseTypeId, state, supabase])

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
      .channel(`program-msgs:${conversationId}`)
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
    return 'bg-blue-100 text-blue-700 border-blue-200'
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
      default:               return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: s }
    }
  }
  const appBadge = getAppBadge(status)

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'steps',     label: 'Next Steps', badge: reviewNeeded || undefined },
    { id: 'documents', label: 'Documents',  badge: docReviewNeeded || undefined },
  ]

  // ── Find the upload item ──────────────────────────────────────────────────────
  const uploadItem = uploadForItemId ? items.find(i => i.id === uploadForItemId) : null

  // ═══════════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">

      {/* ── Compact header — matches ApplicationDetailContent summaryBlocks ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900 truncate">{applicationName}</h1>
              {state && <span className="text-gray-400 text-sm hidden sm:inline">·</span>}
              {state && <span className="text-sm text-gray-500">{state}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${appBadge.bg} ${appBadge.text}`}>
                {appBadge.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-32 bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-semibold text-gray-700 w-9 text-right">{pct}%</span>
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
          </div>
        </div>
      </div>

      {/* ── Tab navigation — matches ApplicationDetailContent tabNavigation ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 -mt-2 px-6">
        <Tabs
          variant="underline"
          active={activeTab}
          onChange={(k) => setActiveTab(k as Tab)}
          items={tabs.map(t => ({ key: t.id, label: t.label, count: t.badge }))}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          NEXT STEPS TAB — mirrors ApplicationRequirementsTab layout exactly
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'steps' && (
        <div>
          {/* Progress summary — identical to ApplicationRequirementsTab */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex gap-4 flex-wrap">
              {approved > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="font-semibold text-gray-800">{approved}</span>
                  <span className="text-gray-500">Approved</span>
                </div>
              )}
              {reviewNeeded > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-gray-800">{reviewNeeded}</span>
                  <span className="text-gray-500">Review Needed</span>
                </div>
              )}
              {inProgress > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-gray-800">{inProgress}</span>
                  <span className="text-gray-500">In Progress</span>
                </div>
              )}
              {notStarted > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Circle className="w-4 h-4 text-gray-400" />
                  <span className="font-semibold text-gray-800">{notStarted}</span>
                  <span className="text-gray-500">Not Started</span>
                </div>
              )}
            </div>
          </div>

          {/* Filter bar — identical to ApplicationRequirementsTab */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Tabs
              variant="pill"
              active={filterType}
              onChange={(k) => setFilterType(k as typeof filterType)}
              items={[
                { key: 'all', label: `All (${clientStepItems.length})` },
                { key: 'required', label: `Required (${clientStepItems.filter(i => i.requirement_type === 'required').length})` },
                { key: 'optional', label: `Optional (${clientStepItems.filter(i => i.requirement_type === 'optional').length})` },
              ]}
            />
          </div>

          {/* Step items table */}
          {clientStepItems.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">No step requirements yet</p>
              <p className="text-sm text-gray-500">Your expert will set up the requirements for this application.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_6rem_9rem_7rem_10rem] gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                {/* <span className="text-xs font-medium text-gray-400">#</span> */}
                <span className="text-xs font-medium text-gray-500">Requirement</span>
                <span className="text-xs font-medium text-gray-500">Type</span>
                <span className="text-xs font-medium text-gray-500">Status</span>
                <span className="text-xs font-medium text-gray-500">Due Date</span>
                <span className="text-xs font-medium text-gray-500">Action</span>
                <span />
              </div>

              {visible.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-500">No items match the current filters.</div>
              )}

              {visible.map(item => {
                const statusCfg = STATUS_CONFIG[item.status]
                const isExpanded = expandedId === item.id
                const isDocument = item.item_type === 'document'
                const docs = itemDocs[item.id] ?? []
                const canSubmit = item.status === 'not_started' || item.status === 'review_needed'
                const canReplace = isDocument && canSubmit && (item.assignment === 'client' || item.assignment === 'both')

                return (
                  <div key={item.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Main row */}
                    <div className="grid grid-cols-[1fr_6rem_9rem_7rem_10rem] gap-2 px-4 py-3 items-center transition-colors hover:bg-gray-50">
                      {/* # */}
                      {/* <span className="text-xs font-mono text-gray-400">{item.item_order}</span> */}

                      {/* Name + type badge + phase */}
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
                          {item.phase && <span className="text-xs text-gray-400">{item.phase}</span>}
                        </div>
                      </div>

                      {/* Required / Optional badge */}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit capitalize ${
                        item.requirement_type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {item.requirement_type}
                      </span>

                      {/* Status — read-only dot badge */}
                      <div>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${statusCfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </div>

                      {/* Due date — read-only */}
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 flex-shrink-0" />
                        {item.due_date ?? '—'}
                      </span>

                      {/* Expand toggle */}
                      {/* <button
                        onClick={() => toggleExpand(item.id, isDocument)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex justify-center"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />
                        }
                      </button> */}
                                              {/* Action button */}
                        {item.status !== 'approved' && (
                          <div>
                            {item.status === 'in_progress' ? (
                              <div className="flex items-center gap-2 text-sm text-blue-600">
                                <Clock className="w-1 h-1" />
                                Under review.
                              </div>
                            ) : canSubmit && (
                              <div className="space-y-1">
                                <Button
                                  variant="primary"
                                  type="button"
                                  size="sm"
                                  onClick={() => handleSubmit(item)}
                                  disabled={
                                    submittingId === item.id ||
                                    (isDocument && docs.length === 0 && loadingDocsFor !== item.id)
                                  }
                                  loading={submittingId === item.id}
                                >
                                  {item.status === 'review_needed' ? 'Resubmit for Review' : 'Submit for Review'}
                                </Button>
                                {isDocument && docs.length === 0 && loadingDocsFor !== item.id && (
                                  <p className="text-xs text-gray-400">Upload a document above before submitting.</p>
                                )}
                                {submitErrors[item.id] && (
                                  <p className="text-xs text-red-500">{submitErrors[item.id]}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                    </div>

                    {/* Expanded area */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 bg-gray-50/50 border-t border-gray-100 space-y-3">

                        {/* Description */}
                        {item.description && (
                          <p className="text-sm text-gray-600">{item.description}</p>
                        )}

                        {/* Instructions */}
                        {item.instructions && (
                          <div className="bg-blue-50 rounded-lg p-3">
                            <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                              <Info className="w-3.5 h-3.5" /> Instructions
                            </p>
                            <p className="text-sm text-blue-800 whitespace-pre-wrap">{item.instructions}</p>
                          </div>
                        )}

                        {/* Feedback from expert (when sent back) */}
                        {item.status === 'review_needed' && item.notes && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-amber-700 mb-1">Feedback from your expert</p>
                            <p className="text-sm text-amber-800">{item.notes}</p>
                          </div>
                        )}

                        {/* Documents section (document items only) */}
                        {isDocument && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded Documents</p>
                            {loadingDocsFor === item.id ? (
                              <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                              </div>
                            ) : docs.length === 0 ? (
                              <p className="text-sm text-gray-400 italic">No documents uploaded yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {docs.map(doc => (
                                  <div
                                    key={doc.id}
                                    className="flex items-center gap-2 py-1.5 px-3 bg-white rounded-lg border border-gray-200"
                                  >
                                    <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                                    <span className="text-sm text-gray-800 truncate">{doc.document_name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {canReplace && (
                              <button
                                onClick={() => setUploadForItemId(item.id)}
                                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors mt-1"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                {docs.length > 0 ? 'Replace Document' : 'Upload Document'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Action button */}
                        {item.status !== 'approved' && (
                          <div>
                            {item.status === 'in_progress' ? (
                              <div className="flex items-center gap-2 text-sm text-blue-600">
                                <Clock className="w-4 h-4" />
                                Submitted — your expert will review and respond soon.
                              </div>
                            ) : canSubmit && (
                              <div className="space-y-1">
                                <button
                                  onClick={() => handleSubmit(item)}
                                  disabled={
                                    submittingId === item.id ||
                                    (isDocument && docs.length === 0 && loadingDocsFor !== item.id)
                                  }
                                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  {submittingId === item.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                  {item.status === 'review_needed' ? 'Resubmit for Review' : 'Submit for Review'}
                                </button>
                                {isDocument && docs.length === 0 && loadingDocsFor !== item.id && (
                                  <p className="text-xs text-gray-400">Upload a document above before submitting.</p>
                                )}
                                {submitErrors[item.id] && (
                                  <p className="text-xs text-red-500">{submitErrors[item.id]}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          DOCUMENTS TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {selectedDocItem && (
        <ProgramItemDetailModal
          item={selectedDocItem}
          agencyId={agencyId}
          isStaff={false}
          onClose={() => setSelectedDocItem(null)}
          onItemUpdated={updated => {
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
            setSelectedDocItem(updated)
          }}
        />
      )}

      {activeTab === 'documents' && (
        <div>
          {clientDocItems.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">No document requirements yet</p>
              <p className="text-sm text-gray-500">Your expert will add document requirements to this application.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {clientDocItems.map(docItem => {
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

      {/* Templates Modal */}
      <Modal isOpen={isTemplatesOpen} onClose={() => setIsTemplatesOpen(false)} title="Document Templates" size="lg">
        <p className="text-sm text-gray-600 mb-4">
          Download templates uploaded by the admin for this license type. Use these to complete your application documents.
        </p>
        {!licenseTypeId ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No license type assigned yet. Templates will appear here once your application has a license type.</p>
          </div>
        ) : isLoadingTemplates ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No templates have been uploaded for this license type yet.</p>
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
                <Button
                  variant="primary"
                  type="button"
                  icon={Download}
                  onClick={async () => {
                    if (tpl.file_url.startsWith('http')) { window.open(tpl.file_url, '_blank'); return }
                    const s = createClient()
                    const { data } = await s.storage.from('license-templates').createSignedUrl(tpl.file_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                >
                  Download
                </Button>
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
              <p className="text-xs mt-1">Start a conversation with your assigned expert</p>
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
                      <div className={`rounded-lg p-3 ${msg.is_own ? 'bg-brand text-white' : 'bg-white border border-gray-200'}`}>
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
              placeholder="Type your message..."
              rows={2}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <Button
              variant="primary"
              onClick={handleSendMessage}
              disabled={!messageContent.trim() || isSendingMessage || !conversationId}
              loading={isSendingMessage}
              icon={isSendingMessage ? undefined : Send}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </Modal>

      {/* Upload Document Modal */}
      {uploadItem && (
        <UploadDocumentModal
          isOpen
          onClose={() => setUploadForItemId(null)}
          applicationId={applicationId}
          applicationPlaybookItemId={uploadItem.id}
          defaultDocumentName={uploadItem.name}
          defaultDocumentType={uploadItem.document_type ?? undefined}
          onSuccess={async () => {
            setUploadForItemId(null)
            const oldDocs = itemDocs[uploadItem.id] ?? []
            await Promise.all(oldDocs.map(doc => deleteApplicationDocument(doc.id)))
            loadDocsForItem(uploadItem.id)
          }}
        />
      )}
    </div>
  )
}
