'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CheckCircle2, Clock, AlertCircle, Circle,
  FileText, Loader2, ChevronRight, CalendarDays,
  Download, Send, Info, SquarePen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'
import {
  getProgramItemNoteCounts,
} from '@/app/actions/playbooks'
import ProgramItemDetailModal from './ProgramItemDetailModal'
import InternalNotesPanel from './InternalNotesPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'items' | 'documents' | 'templates' | 'notes' | 'messages'
type TabId = 'overview' | 'documents' | 'validation' | 'notes' | 'history'
type Status = ApplicationPlaybookItem['status']

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
  not_applicable: { label: 'N/A',           color: 'bg-gray-100 text-gray-400',   dot: 'bg-gray-300' },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  applicationId: string
  applicationName: string
  state: string
  status: string
  agencyId: string | null
  agencyName: string | null
  playbookId: string | null
  initialItems: ApplicationPlaybookItem[]
}

export default function ExpertProgramView({
  applicationId,
  applicationName,
  state,
  status,
  agencyId,
  agencyName,
  playbookId,
  initialItems,
}: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = createClient()

  // ── Tab ───────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('items')
  const activeTabRef = useRef<Tab>('items')
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // ── Items ─────────────────────────────────────────────────────────────────────
  const [items, setItems] = useState(initialItems)

  // ── Filter ────────────────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState<'all' | 'required' | 'optional'>('all')
  const [filterAssignment, setFilterAssignment] = useState<'all' | 'client' | 'expert' | 'both'>('all')

  // ── Notes ─────────────────────────────────────────────────────────────────────
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [modalItem, setModalItem] = useState<ApplicationPlaybookItem | null>(null)
  const [modalDefaultTab, setModalDefaultTab] = useState<TabId>('notes')

  // ── Selected doc item (inline detail) ────────────────────────────────────────
  const [selectedDocItem, setSelectedDocItem] = useState<ApplicationPlaybookItem | null>(null)


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
    if (activeTab === 'templates') fetchTemplates()
  }, [activeTab, fetchTemplates])

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
        if (activeTabRef.current !== 'messages') setUnreadCount(unread.length)
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
          if (!enriched.is_own && activeTabRef.current !== 'messages') {
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
      default:               return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: s }
    }
  }
  const appBadge = getAppBadge(status)

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'items',     label: 'Next Steps', badge: reviewNeeded + inProgress || undefined },
    { id: 'documents', label: 'Documents',  badge: docReviewNeeded || undefined },
    { id: 'templates', label: 'Templates' },
    { id: 'notes',     label: 'Notes' },
    { id: 'messages',  label: 'Messages',   badge: unreadCount || undefined },
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
              <h1 className="text-lg font-bold text-gray-900 truncate">{applicationName}</h1>
              {agencyName && <span className="text-gray-400 text-sm hidden sm:inline">·</span>}
              {agencyName && <span className="text-sm text-gray-500">{agencyName}</span>}
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
          </div>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 -mt-2">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4 px-6 overflow-x-auto" aria-label="Tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'messages') setUnreadCount(0)
                }}
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

                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 flex-shrink-0" />
                        {item.due_date ?? '—'}
                      </span>

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

      {/* ══════════════════════════════════════════════════════════════════════════
          TEMPLATES TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Document Templates</h2>
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
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MESSAGES TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'messages' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Application Messages</h2>
              <p className="text-sm text-gray-600">Communicate with the agency about this program</p>
            </div>
            <div className="p-6">
              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
