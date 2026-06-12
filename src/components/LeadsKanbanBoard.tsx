'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { LEAD_STAGES, type LeadContext } from '@/lib/constants/lead-configs'
import { updateLeadStage } from '@/app/actions/leads'

interface Lead {
  id: string
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  company_name: string | null
  service_type: string | null
  stage: string
  price: number | null
  status: string
  created_at: string
}

interface Props {
  leads: Lead[]
  context: LeadContext
  search: string
}

const ACTIVE_STAGE_KEYS = ['new', 'contacted', 'proposal_sent', 'verbal', 'probable', 'signed']
const TERMINAL_STAGE_KEYS = ['on_hold', 'lost']

const STAGE_HEADER_BG: Record<string, string> = {
  new: 'bg-gray-100',
  contacted: 'bg-blue-50',
  proposal_sent: 'bg-indigo-50',
  verbal: 'bg-yellow-50',
  probable: 'bg-orange-50',
  signed: 'bg-green-50',
  on_hold: 'bg-gray-100',
  lost: 'bg-red-50',
}

const STAGE_BORDER_COLOR: Record<string, string> = {
  new: 'border-l-gray-400',
  contacted: 'border-l-blue-500',
  proposal_sent: 'border-l-indigo-500',
  verbal: 'border-l-yellow-500',
  probable: 'border-l-orange-500',
  signed: 'border-l-green-500',
  on_hold: 'border-l-gray-400',
  lost: 'border-l-red-500',
}

const stageLabelMap = Object.fromEntries(LEAD_STAGES.map(s => [s.key, s.label]))

function displayName(lead: Lead) {
  const full = `${lead.contact_first_name ?? ''} ${lead.contact_last_name ?? ''}`.trim()
  return full || '(No name)'
}

function formatCurrency(val: number | null) {
  if (val == null) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  lead: Lead
  context: LeadContext
  onNavigate: (id: string) => void
  isBeingDragged?: boolean
}

function KanbanCard({ lead, context, onNavigate, isBeingDragged = false }: CardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onNavigate(lead.id)}
      className={`bg-white rounded-lg border border-gray-200 border-l-4 ${STAGE_BORDER_COLOR[lead.stage] ?? 'border-l-gray-400'} px-3 py-2.5 cursor-pointer hover:shadow-md transition-shadow select-none ${isBeingDragged ? 'opacity-30' : ''}`}
    >
      <div className="font-medium text-sm text-gray-900 truncate leading-tight">{displayName(lead)}</div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-xs text-gray-400 truncate min-w-0">
          {lead.company_name || lead.contact_email || '—'}
        </span>
        {context.billingVisible && lead.price != null && (
          <span className="text-xs font-medium text-gray-600 shrink-0">
            {formatCurrency(lead.price)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  stageKey: string
  leads: Lead[]
  context: LeadContext
  activeId: string | null
  onNavigate: (id: string) => void
}

function KanbanColumn({ stageKey, leads, context, activeId, onNavigate }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey })
  const label = stageLabelMap[stageKey] ?? stageKey
  const headerBg = STAGE_HEADER_BG[stageKey] ?? 'bg-gray-100'

  const totalValue = context.billingVisible
    ? leads.reduce((sum, l) => sum + (l.price ?? 0), 0)
    : null

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] h-[calc(100vh-220px)] bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`shrink-0 px-3 py-2.5 ${headerBg} border-b border-gray-200`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider truncate">{label}</span>
          <span className="text-xs font-medium text-gray-500 bg-white rounded-full px-2 py-0.5 border border-gray-200 shrink-0">
            {leads.length}
          </span>
        </div>
        {totalValue != null && totalValue > 0 && (
          <div className="text-xs text-gray-500 mt-0.5">{formatCurrency(totalValue)}</div>
        )}
      </div>

      {/* Card list — scrolls independently */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-2 flex flex-col gap-2 transition-colors ${isOver ? 'bg-blue-50/60' : ''}`}
      >
        {leads.map(lead => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            context={context}
            onNavigate={onNavigate}
            isBeingDragged={activeId === lead.id}
          />
        ))}
        {leads.length === 0 && (
          <div className={`flex items-center justify-center h-14 text-xs rounded-lg border-2 border-dashed transition-colors ${isOver ? 'border-blue-300 text-blue-400' : 'border-gray-200 text-gray-300'}`}>
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

// ── Board ─────────────────────────────────────────────────────────────────────

export default function LeadsKanbanBoard({ leads: initialLeads, context, search }: Props) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [terminalExpanded, setTerminalExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync when server re-renders pass fresh props (e.g. after router.refresh())
  useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return leads
    return leads.filter(lead => {
      const name = `${lead.contact_first_name ?? ''} ${lead.contact_last_name ?? ''}`.toLowerCase()
      const company = (lead.company_name ?? '').toLowerCase()
      const email = (lead.contact_email ?? '').toLowerCase()
      return name.includes(term) || company.includes(term) || email.includes(term)
    })
  }, [leads, search])

  const leadsPerStage = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    for (const key of [...ACTIVE_STAGE_KEYS, ...TERMINAL_STAGE_KEYS]) map[key] = []
    for (const lead of filteredLeads) {
      if (map[lead.stage]) map[lead.stage].push(lead)
      else map[lead.stage] = [lead]
    }
    return map
  }, [filteredLeads])

  const activeLead = activeId ? leads.find(l => l.id === activeId) ?? null : null

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string)
    setError(null)
  }, [])

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return

    const newStage = over.id as string
    const leadId = active.id as string
    const prevLead = leads.find(l => l.id === leadId)
    if (!prevLead || prevLead.stage === newStage) return

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l))

    const result = await updateLeadStage(leadId, newStage)
    if (result?.error) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: prevLead.stage } : l))
      setError('Failed to update stage. Please try again.')
    } else {
      router.refresh()
    }
  }, [leads, router])

  const handleNavigate = useCallback((id: string) => {
    router.push(`${context.detailPath}/${id}`)
  }, [router, context.detailPath])

  return (
    <div>
      {error && (
        <div className="mb-3 flex items-center justify-between px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-3 underline text-xs">Dismiss</button>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 w-max">
            {/* Active stage columns */}
            {ACTIVE_STAGE_KEYS.map(key => (
              <KanbanColumn
                key={key}
                stageKey={key}
                leads={leadsPerStage[key] ?? []}
                context={context}
                activeId={activeId}
                onNavigate={handleNavigate}
              />
            ))}

            {/* Terminal stages — collapsed strip or expanded columns */}
            {terminalExpanded ? (
              <>
                {TERMINAL_STAGE_KEYS.map(key => (
                  <KanbanColumn
                    key={key}
                    stageKey={key}
                    leads={leadsPerStage[key] ?? []}
                    context={context}
                    activeId={activeId}
                    onNavigate={handleNavigate}
                  />
                ))}
                <div className="flex items-start pt-2 pl-1">
                  <button
                    type="button"
                    onClick={() => setTerminalExpanded(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap transition-colors"
                  >
                    ← Hide
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col min-w-[72px] w-[72px] h-[calc(100vh-220px)] bg-gray-50 rounded-xl border border-gray-200 border-dashed overflow-hidden">
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-2">
                  {TERMINAL_STAGE_KEYS.map(key => {
                    const count = leadsPerStage[key]?.length ?? 0
                    return (
                      <div key={key} className="flex flex-col items-center gap-1.5">
                        <span
                          className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {stageLabelMap[key]}
                        </span>
                        {count > 0 && (
                          <span className="text-xs font-medium text-gray-500 bg-white rounded-full w-6 h-6 flex items-center justify-center border border-gray-200">
                            {count}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setTerminalExpanded(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1 transition-colors"
                  >
                    Show →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay — ghost card that follows the cursor */}
        <DragOverlay dropAnimation={null}>
          {activeLead && (
            <div
              className={`bg-white rounded-lg border border-gray-200 border-l-4 ${STAGE_BORDER_COLOR[activeLead.stage] ?? 'border-l-gray-400'} px-3 py-2.5 shadow-xl w-[244px] opacity-95`}
            >
              <div className="font-medium text-sm text-gray-900 truncate leading-tight">{displayName(activeLead)}</div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-xs text-gray-400 truncate min-w-0">
                  {activeLead.company_name || activeLead.contact_email || '—'}
                </span>
                {context.billingVisible && activeLead.price != null && (
                  <span className="text-xs font-medium text-gray-600 shrink-0">
                    {formatCurrency(activeLead.price)}
                  </span>
                )}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
