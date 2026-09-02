'use client'

import { useState, useEffect, useRef } from 'react'
import {
  CheckCircle2, Clock, AlertCircle, XCircle, Circle,
  ChevronRight, CalendarDays,
  Loader2, ClipboardList,
  SquarePen,
} from 'lucide-react'
import type { TabId } from './ProgramItemDetailModal'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'
import {
  getApplicationProgramItems,
  getProgramItemNoteCounts,
  migrateApplicationToProgram,
  applyPlaybookToApplication,
  updateProgramItem,
} from '@/app/actions/playbooks'
import ProgramItemDetailModal from './ProgramItemDetailModal'
import Button from '@/components/ui/PrimaryButton'
import Tabs from '@/components/ui/Tabs'

// ─── Status config ────────────────────────────────────────────────────────────

type Status = ApplicationPlaybookItem['status']

const STATUS_CONFIG: Record<Status, { label: string; color: string; dot: string }> = {
  not_started:   { label: 'Not Started',   color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  in_progress:   { label: 'In Progress',   color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  review_needed: { label: 'Review Needed', color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  approved:      { label: 'Approved',      color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
}

const STATUS_ORDER: Status[] = ['not_started', 'in_progress', 'review_needed', 'approved']

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  applicationId: string
  agencyId: string | null
  isStaff: boolean
  onProgressChange?: (pct: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

function computePct(list: ApplicationPlaybookItem[]) {
  return list.length > 0 ? Math.round((list.filter(i => i.status === 'approved').length / list.length) * 100) : 0
}

export default function ApplicationRequirementsTab({ applicationId, agencyId, isStaff, onProgressChange }: Props) {
  const [items, setItems] = useState<ApplicationPlaybookItem[]>([])
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isApplying, setIsApplying] = useState(false)
  const [noPlaybook, setNoPlaybook] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'required' | 'optional'>('all')
  const [filterAssignment, setFilterAssignment] = useState<'all' | 'client' | 'expert' | 'both'>('all')

  // Item detail modal
  const [modalItem, setModalItem] = useState<ApplicationPlaybookItem | null>(null)
  const [modalDefaultTab, setModalDefaultTab] = useState<TabId>('overview')

  // Status popover
  const [statusPopoverId, setStatusPopoverId] = useState<string | null>(null)
  const statusPopoverRef = useRef<HTMLDivElement>(null)

  // ── Load data on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    load()
  }, [applicationId])

  async function load() {
    setIsLoading(true)
    setError(null)

    // Always sync first — safe to call repeatedly, only adds missing items
    const migResult = await migrateApplicationToProgram(applicationId)
    if (migResult.error) { setError(migResult.error); setIsLoading(false); return }

    const result = await getApplicationProgramItems(applicationId)
    if (result.error) { setError(result.error); setIsLoading(false); return }
    setItems(result.items)
    setNoteCounts(await getProgramItemNoteCounts(result.items.map(i => i.id)))
    onProgressChange?.(computePct(result.items))
    setIsLoading(false)
  }

  // ── Close popovers on outside click ────────────────────────────────────────

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (statusPopoverRef.current && !statusPopoverRef.current.contains(e.target as Node)) {
        setStatusPopoverId(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // ── Status update ───────────────────────────────────────────────────────────

  async function handleStatusChange(item: ApplicationPlaybookItem, status: Status) {
    setStatusPopoverId(null)
    setItems(prev => {
      const next = prev.map(i => i.id === item.id ? { ...i, status } : i)
      onProgressChange?.(computePct(next))
      return next
    })
    const result = await updateProgramItem(item.id, { status })
    if (result.error) {
      setItems(prev => {
        const reverted = prev.map(i => i.id === item.id ? { ...i, status: item.status } : i)
        onProgressChange?.(computePct(reverted))
        return reverted
      })
      setError(result.error)
    }
  }

  // ── Due date update ─────────────────────────────────────────────────────────

  async function handleDueDateChange(item: ApplicationPlaybookItem, due_date: string) {
    const val = due_date || null
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, due_date: val } : i))
    await updateProgramItem(item.id, { due_date: val })
  }

  // ── Item updated callback from modal ───────────────────────────────────────

  function handleItemUpdated(updated: ApplicationPlaybookItem) {
    setItems(prev => {
      const next = prev.map(i => i.id === updated.id ? updated : i)
      onProgressChange?.(computePct(next))
      return next
    })
  }

  // ── Apply playbook (empty state) ────────────────────────────────────────────

  async function handleApplyPlaybook() {
    setIsApplying(true)
    setError(null)
    const result = await applyPlaybookToApplication(applicationId)
    if (result.error) {
      if (result.error.includes('No playbook')) setNoPlaybook(true)
      else setError(result.error)
    } else {
      await load()
    }
    setIsApplying(false)
  }

  // ── Progress calculation ────────────────────────────────────────────────────

  const approved = items.filter(i => i.status === 'approved').length
  const inProgress = items.filter(i => i.status === 'in_progress').length
  const reviewNeeded = items.filter(i => i.status === 'review_needed').length
  const notStarted = items.filter(i => i.status === 'not_started').length
  const pct = items.length > 0 ? Math.round((approved / items.length) * 100) : 0

  // ── Filtered items ──────────────────────────────────────────────────────────

  const visible = items.filter(i => {
    if (filterType !== 'all' && i.requirement_type !== filterType) return false
    if (filterAssignment !== 'all' && i.assignment !== filterAssignment) return false
    return true
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Loading requirements…</span>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-700 mb-1">No requirements checklist yet</p>
        {noPlaybook ? (
          <p className="text-sm text-gray-500">No playbook has been built for this license type. Build one in License Requirements first.</p>
        ) : isStaff ? (
          <>
            <p className="text-sm text-gray-500 mb-4">Apply the playbook template for this license type to get started.</p>
            <Button variant="primary" type="button" icon={ClipboardList} onClick={handleApplyPlaybook} disabled={isApplying} loading={isApplying}>
              Apply Playbook
            </Button>
          </>
        ) : (
          <p className="text-sm text-gray-500">Your expert will set up the requirements checklist for this application.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Progress summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        {/* <div className="flex items-center gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-gray-800">Overall Progress</span>
              <span className="text-sm font-bold text-gray-800">{pct}% Complete</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div> */}
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
        {/* Type filter tabs */}
        <Tabs
          variant="pill"
          items={[
            { key: 'all', label: `All (${items.length})` },
            { key: 'required', label: `Required (${items.filter(i => i.requirement_type === 'required').length})` },
            { key: 'optional', label: `Optional (${items.filter(i => i.requirement_type === 'optional').length})` },
          ]}
          active={filterType}
          onChange={(key) => setFilterType(key as typeof filterType)}
        />
        {/* Assignment filter */}
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

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_6rem_9rem_7rem_2rem_2rem] gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-medium text-gray-400">#</span>
          <span className="text-xs font-medium text-gray-500">Requirement</span>
          <span className="text-xs font-medium text-gray-500">Type</span>
          <span className="text-xs font-medium text-gray-500">Status</span>
          <span className="text-xs font-medium text-gray-500">Due Date</span>
          <span className="text-xs font-medium text-gray-500">Notes</span>
          <span className="text-xs font-medium text-gray-500"></span>
        </div>

        {visible.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500">No items match the current filters.</div>
        )}

        {visible.map(item => {
          const statusCfg = STATUS_CONFIG[item.status]

          return (
            <div key={item.id} className="border-b border-gray-100 last:border-b-0">
              {/* Row */}
              <div className="grid grid-cols-[2rem_1fr_6rem_9rem_7rem_2rem_2rem] gap-2 px-4 py-3 items-center transition-colors hover:bg-gray-50">
                {/* # */}
                <span className="text-xs font-mono text-gray-400">{item.item_order}</span>

                {/* Name */}
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate font-medium">{item.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs font-medium px-1.5 py-0 rounded ${
                      item.item_type === 'document' ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {item.item_type === 'document' ? 'Document' : 'Step'}
                    </span>
                    {item.phase && <span className="text-xs text-gray-400">{item.phase}</span>}
                  </div>
                </div>

                {/* Type badge */}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit capitalize ${
                  item.requirement_type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {item.requirement_type}
                </span>

                {/* Status — clickable for staff */}
                <div className="relative" ref={statusPopoverId === item.id ? statusPopoverRef : undefined}>
                  <button
                    disabled={!isStaff}
                    onClick={() => isStaff && setStatusPopoverId(statusPopoverId === item.id ? null : item.id)}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors ${statusCfg.color} ${isStaff ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                    {statusCfg.label}
                  </button>
                  {statusPopoverId === item.id && (
                    <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]">
                      {STATUS_ORDER.map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(item, s)}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${item.status === s ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_CONFIG[s].dot}`} />
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Due date */}
                <div>
                  {isStaff ? (
                    <input
                      type="date"
                      value={item.due_date ?? ''}
                      onChange={e => handleDueDateChange(item, e.target.value)}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-transparent w-full"
                    />
                  ) : (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {item.due_date ?? '—'}
                    </span>
                  )}
                </div>

                {/* Notes icon — opens modal on Notes tab */}
                <div className="flex justify-center">
                  <button
                    onClick={() => { setModalItem(item); setModalDefaultTab('notes') }}
                    className="relative p-1 rounded transition-colors text-gray-400 hover:text-blue-700"
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

                {/* Expand chevron — opens modal on Overview tab */}
                <button
                  onClick={() => { setModalItem(item); setModalDefaultTab('overview') }}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {modalItem && (
        <ProgramItemDetailModal
          item={modalItem}
          agencyId={agencyId}
          isStaff={isStaff}
          defaultTab={modalDefaultTab}
          onClose={async () => {
            setModalItem(null)
            setNoteCounts(await getProgramItemNoteCounts(items.map(i => i.id)))
          }}
          onItemUpdated={handleItemUpdated}
        />
      )}
    </div>
  )
}
