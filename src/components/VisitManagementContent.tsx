'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  MapPin,
  Loader2,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
  User,
  XCircle,
} from 'lucide-react'
import Modal from './Modal'
import DeclineAssignmentModal from './DeclineAssignmentModal'
import InternalNotesPanel from './InternalNotesPanel'
import {
  approveScheduleAssignmentRequestAction,
  approveScheduleUnassignmentRequestAction,
  assignCaregiverToScheduleAction,
  declineScheduleAssignmentRequestAction,
  declineScheduleUnassignmentRequestAction,
  markScheduleMissedAction,
  unassignCaregiverFromScheduleAction,
} from '@/app/actions/schedule-assignment-requests'
import { getCaregiverCandidatesForVisitAction } from '@/app/actions/visit-candidates'
import type {
  AssignmentRequestCardDTO,
  AssignmentVisitCardDTO,
  ResolvedAssignmentRowDTO,
  UnassignmentRequestListItemDTO,
} from '@/lib/visit-assignment-dashboard'
import type { AllVisitCardDTO, ReassignCandidateDTO, VisitStatus } from '@/lib/visit-all-visits-dashboard'
import { visitStatusBadgeClass, visitStatusLeftBorderClass } from '@/lib/visit-status-styles'

export type VisitManagementContentProps = {
  visits: AssignmentVisitCardDTO[]
  unassignmentItems: UnassignmentRequestListItemDTO[]
  allVisits: AllVisitCardDTO[]
  allClients: Array<{ id: string; name: string }>
  allCaregivers: Array<{ id: string; name: string }>
  resolved: ResolvedAssignmentRowDTO[]
  assignmentApprovedTotal: number
  assignmentDeclinedTotal: number
  unassignmentApprovedTotal: number
  unassignmentDeclinedTotal: number
  loadError?: string
  agencyId?: string
  canManageNotes?: boolean
}

function formatDistance(miles: number): string {
  if (!Number.isFinite(miles)) return '-'
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

function ProgressRow({ label, value, barClass }: { label: string; value: number; barClass: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function dateFilterMatch(date: string, dateFilter: string): boolean {
  if (dateFilter === 'all') return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${date}T00:00:00`)
  if (dateFilter === 'today') return d.getTime() === today.getTime()
  if (dateFilter === 'past') return d < today
  if (dateFilter === 'upcoming') return d >= today
  if (dateFilter === 'next7') {
    const end = new Date(today)
    end.setDate(end.getDate() + 7)
    return d >= today && d <= end
  }
  return true
}

function isPastVisitDate(date: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${date}T00:00:00`)
  return d < today
}

const CARE_VISITS_PATH = '/pages/agency/care-visits'

function tabFromSearchParams(searchParams: { get: (key: string) => string | null }): 'all' | 'requests' {
  return searchParams.get('tab') === 'requests' ? 'requests' : 'all'
}

function requestsSubtabFromSearchParams(searchParams: { get: (key: string) => string | null }): 'assignment' | 'unassignment' {
  return searchParams.get('subtab') === 'unassignment' ? 'unassignment' : 'assignment'
}

function relativeDateHeader(date: string, fallbackLabel: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${date}T00:00:00`)
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return `Today — ${fallbackLabel}`
  if (diffDays === -1) return `Yesterday — ${fallbackLabel}`
  if (diffDays === 1) return `Tomorrow — ${fallbackLabel}`
  return fallbackLabel
}

export default function VisitManagementContent({
  visits,
  unassignmentItems,
  allVisits,
  allClients,
  allCaregivers,
  resolved,
  assignmentApprovedTotal,
  assignmentDeclinedTotal,
  unassignmentApprovedTotal,
  unassignmentDeclinedTotal,
  loadError,
  agencyId,
  canManageNotes,
}: VisitManagementContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tabNavPending, startTabNavTransition] = useTransition()
  const [tabLoadingKey, setTabLoadingKey] = useState<'all' | 'requests' | 'assignment' | 'unassignment' | null>(null)
  const [tab, setTab] = useState<'all' | 'requests'>(() => tabFromSearchParams(searchParams))
  const [requestsSubtab, setRequestsSubtab] = useState<'assignment' | 'unassignment'>(() =>
    requestsSubtabFromSearchParams(searchParams)
  )

  useEffect(() => {
    setTab(tabFromSearchParams(searchParams))
    setRequestsSubtab(requestsSubtabFromSearchParams(searchParams))
    setTabLoadingKey(null)
  }, [searchParams])

  const goToRequestsSubtab = (sub: 'assignment' | 'unassignment') => {
    setRequestsSubtab(sub)
    setTabLoadingKey(sub)
    startTabNavTransition(() => {
      router.replace(`${CARE_VISITS_PATH}?tab=requests&subtab=${sub}`, { scroll: false })
    })
  }

  const goToVisitTab = (next: 'all' | 'requests') => {
    if (next === 'requests') {
      const sub = requestsSubtabFromSearchParams(searchParams)
      setTab('requests')
      setRequestsSubtab(sub)
      setTabLoadingKey('requests')
      startTabNavTransition(() => {
        router.replace(`${CARE_VISITS_PATH}?tab=requests&subtab=${sub}`, { scroll: false })
      })
    } else {
      setTab('all')
      setTabLoadingKey('all')
      startTabNavTransition(() => {
        router.replace(CARE_VISITS_PATH, { scroll: false })
      })
    }
  }
  const [actionError, setActionError] = useState<string | null>(null)
  const pendingRequestClearTimerRef = useRef<number | null>(null)
  const unassignmentVisibilityLogRef = useRef<{
    requestId: string
    action: 'approve' | 'decline'
    refreshChecks: number
  } | null>(null)
  /** Scoped pending key so one request's approve/decline (and per-visit actions) do not disable all controls. */
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)
  const [declineModal, setDeclineModal] = useState<{
    requestId: string
    caregiverName: string
    clientName: string
    kind: 'assignment' | 'unassignment'
  } | null>(null)
  const [detailVisit, setDetailVisit] = useState<AllVisitCardDTO | null>(null)
  const [reassignVisit, setReassignVisit] = useState<AllVisitCardDTO | null>(null)
  const [missVisit, setMissVisit] = useState<AllVisitCardDTO | null>(null)
  const [candidates, setCandidates] = useState<ReassignCandidateDTO[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [missReason, setMissReason] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [caregiverFilter, setCaregiverFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest')

  const pendingAssignmentCount = useMemo(() => visits.reduce((sum, v) => sum + v.requests.length, 0), [visits])
  const pendingUnassignmentCount = unassignmentItems.length
  const pendingCaregiverRequestTotal = pendingAssignmentCount + pendingUnassignmentCount

  const requestsSummary = useMemo(() => {
    if (requestsSubtab === 'assignment') {
      return {
        pending: pendingAssignmentCount,
        approved: assignmentApprovedTotal,
        declined: assignmentDeclinedTotal,
        pendingCaption: 'Pending assignment requests',
      }
    }
    return {
      pending: pendingUnassignmentCount,
      approved: unassignmentApprovedTotal,
      declined: unassignmentDeclinedTotal,
      pendingCaption: 'Pending unassignment requests',
    }
  }, [
    requestsSubtab,
    pendingAssignmentCount,
    pendingUnassignmentCount,
    assignmentApprovedTotal,
    assignmentDeclinedTotal,
    unassignmentApprovedTotal,
    unassignmentDeclinedTotal,
  ])

  const isRequestActionKey = (key: string) =>
    key.startsWith('approve:') ||
    key.startsWith('decline:') ||
    key.startsWith('approve-unassign:') ||
    key.startsWith('decline-unassign:')

  const runAction = async (key: string, fn: () => Promise<{ ok?: true; error?: string }>) => {
    setActionError(null)
    setPendingActionKey(key)
    let keepPendingForRefresh = false
    try {
      const result = await fn()
      if (result.error) {
        if (
          unassignmentVisibilityLogRef.current &&
          (key.startsWith('approve-unassign:') || key.startsWith('decline-unassign:'))
        ) {
          console.warn(
            `[UnassignmentRequest][${unassignmentVisibilityLogRef.current.action}] ${unassignmentVisibilityLogRef.current.requestId} failed: ${result.error}`
          )
          unassignmentVisibilityLogRef.current = null
        }
        setActionError(result.error)
        setPendingActionKey(null)
        return
      }
      router.refresh()
      if (isRequestActionKey(key)) {
        keepPendingForRefresh = true
        if (pendingRequestClearTimerRef.current) window.clearTimeout(pendingRequestClearTimerRef.current)
        // Keep loading state until refresh removes the request row (effect below). Fallback timeout avoids stuck UI.
        pendingRequestClearTimerRef.current = window.setTimeout(() => {
          setPendingActionKey((curr) => (curr === key ? null : curr))
          pendingRequestClearTimerRef.current = null
        }, 10000)
        return
      }
    } finally {
      if (!keepPendingForRefresh) setPendingActionKey(null)
    }
  }

  const clientOptions = useMemo(() => allClients, [allClients])
  const caregiverOptions = useMemo(() => allCaregivers, [allCaregivers])

  const filteredAllVisits = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = allVisits.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false
      if (!dateFilterMatch(v.date, dateFilter)) return false
      if (clientFilter !== 'all' && v.clientId !== clientFilter) return false
      if (caregiverFilter !== 'all' && (v.caregiverId ?? 'none') !== caregiverFilter) return false
      if (q) {
        // Match list + modal copy: visitTitle often duplicates type; rows emphasize ADL task names (adlTasks).
        const hay = `${v.visitTitle} ${v.typeLabel} ${v.adlTasks.join(' ')} ${v.clientName} ${v.caregiverName ?? ''} ${v.locationLabel} ${v.notes ?? ''}`
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return [...rows].sort((a, b) => {
      const av = `${a.date} ${a.timeLabel}`
      const bv = `${b.date} ${b.timeLabel}`
      return sortOrder === 'oldest' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [allVisits, search, statusFilter, dateFilter, clientFilter, caregiverFilter, sortOrder])

  const groupedVisits = useMemo(() => {
    const map = new Map<string, { label: string; visits: AllVisitCardDTO[] }>()
    for (const v of filteredAllVisits) {
      const item = map.get(v.date)
      if (item) item.visits.push(v)
      else map.set(v.date, { label: relativeDateHeader(v.date, v.dateLabel), visits: [v] })
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }))
  }, [filteredAllVisits])

  const hasActiveFilters = useMemo(
    () =>
      search.trim() !== '' ||
      statusFilter !== 'all' ||
      dateFilter !== 'all' ||
      clientFilter !== 'all' ||
      caregiverFilter !== 'all' ||
      sortOrder !== 'oldest',
    [search, statusFilter, dateFilter, clientFilter, caregiverFilter, sortOrder]
  )

  const clearAllFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setDateFilter('all')
    setClientFilter('all')
    setCaregiverFilter('all')
    setSortOrder('oldest')
  }

  const handleApprove = (request: AssignmentRequestCardDTO) =>
    void runAction(`approve:${request.id}`, () => approveScheduleAssignmentRequestAction(request.id))
  const startUnassignmentVisibilityLog = (requestId: string, action: 'approve' | 'decline') => {
    unassignmentVisibilityLogRef.current = { requestId, action, refreshChecks: 0 }
    console.info(`[UnassignmentRequest][${action}] ${requestId} clicked. Tracking until removed from UI.`)
  }
  const handleApproveUnassign = (requestId: string) => {
    startUnassignmentVisibilityLog(requestId, 'approve')
    void runAction(`approve-unassign:${requestId}`, () => approveScheduleUnassignmentRequestAction(requestId))
  }
  const confirmDecline = (reason: string) => {
    if (!declineModal) return
    const { requestId, kind } = declineModal
    setDeclineModal(null)
    if (kind === 'unassignment') {
      startUnassignmentVisibilityLog(requestId, 'decline')
      void runAction(`decline-unassign:${requestId}`, () =>
        declineScheduleUnassignmentRequestAction(requestId, reason)
      )
    } else {
      void runAction(`decline:${requestId}`, () => declineScheduleAssignmentRequestAction(requestId, reason))
    }
  }
  const handleUnassign = (visit: AllVisitCardDTO) =>
    void runAction(`unassign:${visit.id}`, () => unassignCaregiverFromScheduleAction(visit.id))
  const openReassignModal = async (visit: AllVisitCardDTO) => {
    setReassignVisit(visit)
    setCandidates([])
    setLoadingCandidates(true)
    const result = await getCaregiverCandidatesForVisitAction(visit.id)
    setCandidates(result.data ?? [])
    setLoadingCandidates(false)
  }
  const handleAssign = (visit: AllVisitCardDTO, caregiverId: string) => {
    setReassignVisit(null)
    setCandidates([])
    void runAction(`assign:${visit.id}`, () => assignCaregiverToScheduleAction(visit.id, caregiverId))
  }
  const handleMiss = () => {
    if (!missVisit) return
    const id = missVisit.id
    const reason = missReason
    setMissVisit(null)
    setMissReason('')
    void runAction(`miss:${id}`, () => markScheduleMissedAction(id, reason))
  }

  const requestActionBusy = (requestId: string, kind: 'assignment' | 'unassignment' = 'assignment') => {
    if (kind === 'unassignment') {
      return (
        pendingActionKey === `approve-unassign:${requestId}` || pendingActionKey === `decline-unassign:${requestId}`
      )
    }
    return pendingActionKey === `approve:${requestId}` || pendingActionKey === `decline:${requestId}`
  }
  const visibleResolved = useMemo(
    () =>
      resolved.filter((row) =>
        requestsSubtab === 'assignment' ? row.requestType === 'assignment' : row.requestType === 'unassignment'
      ),
    [resolved, requestsSubtab]
  )

  useEffect(() => {
    const tracking = unassignmentVisibilityLogRef.current
    if (!tracking) return

    const stillVisible = unassignmentItems.some((item) => item.requestId === tracking.requestId)
    if (!stillVisible) {
      console.info(
        `[UnassignmentRequest][${tracking.action}] ${tracking.requestId} removed from UI after ${tracking.refreshChecks} check(s).`
      )
      unassignmentVisibilityLogRef.current = null
      return
    }

    tracking.refreshChecks += 1
    console.info(
      `[UnassignmentRequest][${tracking.action}] ${tracking.requestId} still visible (check ${tracking.refreshChecks}).`
    )

    if (tracking.refreshChecks >= 6) {
      console.warn(
        `[UnassignmentRequest][${tracking.action}] ${tracking.requestId} still visible after multiple refresh checks.`
      )
      unassignmentVisibilityLogRef.current = null
      return
    }

    const timer = window.setTimeout(() => {
      const latest = unassignmentVisibilityLogRef.current
      if (!latest || latest.requestId !== tracking.requestId) return
      console.info(`[UnassignmentRequest][${latest.action}] requesting another refresh for ${latest.requestId}.`)
      router.refresh()
    }, 700)

    return () => window.clearTimeout(timer)
  }, [unassignmentItems, router])

  useEffect(() => {
    if (!pendingActionKey || !isRequestActionKey(pendingActionKey)) return
    let requestId = ''
    let stillVisible = false

    if (pendingActionKey.startsWith('approve-unassign:') || pendingActionKey.startsWith('decline-unassign:')) {
      requestId = pendingActionKey.split(':')[1] ?? ''
      stillVisible = unassignmentItems.some((item) => item.requestId === requestId)
    } else {
      requestId = pendingActionKey.split(':')[1] ?? ''
      stillVisible = visits.some((v) => v.requests.some((r) => r.id === requestId))
    }

    if (!stillVisible) {
      setPendingActionKey(null)
      if (pendingRequestClearTimerRef.current) {
        window.clearTimeout(pendingRequestClearTimerRef.current)
        pendingRequestClearTimerRef.current = null
      }
    }
  }, [pendingActionKey, unassignmentItems, visits])

  useEffect(() => {
    return () => {
      if (pendingRequestClearTimerRef.current) window.clearTimeout(pendingRequestClearTimerRef.current)
    }
  }, [])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {loadError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div> : null}
      {actionError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</div> : null}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visit Management</h1>
          <p className="text-sm text-gray-600 mt-1">View, sort, and manage all care visits. Assign caregivers and track visit status.</p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100/80 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => goToVisitTab('all')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === 'all' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {tabNavPending && tabLoadingKey === 'all' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            All Visits
          </button>
          <button
            type="button"
            onClick={() => goToVisitTab('requests')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === 'requests' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {tabNavPending && tabLoadingKey === 'requests' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Caregiver Requests
            {pendingCaregiverRequestTotal > 0 ? <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 min-w-[1.25rem] text-center">{pendingCaregiverRequestTotal}</span> : null}
          </button>
        </div>
      </div>

      {tab === 'all' ? (
        <>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-3">
            <span>
              {pendingCaregiverRequestTotal} caregiver request{pendingCaregiverRequestTotal === 1 ? '' : 's'} awaiting
              your review
            </span>
            <button type="button" onClick={() => goToVisitTab('requests')} className="text-amber-700 font-semibold hover:underline">Click to review</button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap gap-2 items-center">
            <div className="relative grow min-w-[220px]">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-2.5" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by client, caregiver, or visit title..." className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
              <option value="unassigned">Unassigned</option>
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="past">Past Visits</option>
              <option value="upcoming">Upcoming</option>
              <option value="next7">Next 7 Days</option>
            </select>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="all">Client</option>
              {clientOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={caregiverFilter} onChange={(e) => setCaregiverFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="all">Caregiver</option>
              <option value="none">No caregiver assigned</option>
              {caregiverOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'oldest' | 'newest')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm ml-auto">
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">Showing {filteredAllVisits.length} of {allVisits.length} visits</p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-sm font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-colors"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="space-y-6">
            {groupedVisits.map((group) => {
              const unassignedCount = group.visits.filter((v) => v.status === 'unassigned').length
              return (
                <div key={group.date} className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <span>{group.label}</span>
                    <span className="text-gray-500 font-medium">{group.visits.length} visit{group.visits.length > 1 ? 's' : ''}</span>
                    {unassignedCount > 0 ? <span className="text-xs text-red-700 bg-red-100 border border-red-200 rounded-full px-2 py-0.5">{unassignedCount} unassigned</span> : null}
                  </div>
                  {group.visits.map((visit) => {
                    const isPastVisit = isPastVisitDate(visit.date)
                    const isLockedStatus = visit.status === 'completed' || visit.status === 'missed'
                    return (
                    <div key={visit.id} className={`bg-white border rounded-xl p-4 shadow-sm border-l-4 ${visitStatusLeftBorderClass(visit.status)} ${visit.status === 'unassigned' ? 'border-red-200' : 'border-gray-200'}`}>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                        <div className="min-w-[84px] text-sm">
                          <div className="text-xs text-gray-500">{visit.date.slice(5).replace('-', ' / ')}</div>
                          <div className="font-semibold text-gray-900">{visit.timeLabel.split(' - ')[0] || '-'}</div>
                        </div>
                        <div className="flex-1 space-y-2">
                          {/* <div className="font-semibold text-gray-900">{visit.visitTitle}</div> */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 text-lg">{visit.adlTasks.length ? visit.adlTasks.join(', ') : 'No ADL tasks'}</span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${visitStatusBadgeClass(visit.status)}`}>{visit.statusLabel}</span>
                            <span className="inline-flex items-center rounded-full border border-blue-200 text-blue-700 text-xs px-2 py-0.5">{visit.typeLabel}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {visit.clientName}</span>
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {visit.locationLabel}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {visit.timeLabel}</span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${visit.caregiverName ? 'border-blue-200 text-blue-700' : 'border-red-200 text-red-700'}`}>
                              {visit.caregiverName ?? 'No caregiver assigned'}
                            </span>
                          </div>
                        </div>
                        <div className="flex lg:flex-col gap-2 lg:w-[130px]">
                          <button type="button" onClick={() => setDetailVisit(visit)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50">Details</button>
                          {!isPastVisit && !isLockedStatus ? (
                            <>
                              <button
                                type="button"
                                disabled={pendingActionKey === `assign:${visit.id}`}
                                onClick={() => void openReassignModal(visit)}
                                className="rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                              >
                                {visit.caregiverId ? 'Reassign' : 'Assign'}
                              </button>
                              {visit.caregiverId ? (
                                <button
                                  type="button"
                                  disabled={pendingActionKey === `unassign:${visit.id}`}
                                  onClick={() => handleUnassign(visit)}
                                  className="rounded-lg border border-red-200 text-red-600 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
                                >
                                  Unassign
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={pendingActionKey === `miss:${visit.id}`}
                                onClick={() => setMissVisit(visit)}
                                className="rounded-lg border border-orange-200 text-orange-700 px-3 py-2 text-sm font-medium hover:bg-orange-50 disabled:opacity-60"
                              >
                                Miss
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              )
            })}
            {groupedVisits.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">No visits found for current filters.</div> : null}
          </div>
        </>
      ) : (
        <>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100/80 p-1 shadow-inner mb-2">
            <button
              type="button"
              onClick={() => goToRequestsSubtab('assignment')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${requestsSubtab === 'assignment' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {tabNavPending && tabLoadingKey === 'assignment' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Assignment Requests
              {pendingAssignmentCount > 0 ? (
                <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 min-w-[1.25rem] text-center">
                  {pendingAssignmentCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => goToRequestsSubtab('unassignment')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${requestsSubtab === 'unassignment' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {tabNavPending && tabLoadingKey === 'unassignment' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Unassignment Requests
              {pendingUnassignmentCount > 0 ? (
                <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 min-w-[1.25rem] text-center">
                  {pendingUnassignmentCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 flex items-center gap-4 shadow-sm">
              <div className="rounded-full bg-amber-100 p-3 text-amber-700">
                <Bell className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{requestsSummary.pending}</div>
                <div className="text-sm text-gray-600">{requestsSummary.pendingCaption}</div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 flex items-center gap-4 shadow-sm">
              <div className="rounded-full bg-emerald-100 p-3 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{requestsSummary.approved}</div>
                <div className="text-sm text-gray-600">Approved</div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center gap-4 shadow-sm">
              <div className="rounded-full bg-gray-200 p-3 text-gray-600">
                <ThumbsDown className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{requestsSummary.declined}</div>
                <div className="text-sm text-gray-600">Declined</div>
              </div>
            </div>
          </div>

          <div>
            {requestsSubtab === 'unassignment' ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">Unassignment Requests</h2>
                  {pendingUnassignmentCount > 0 ? (
                    <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      {pendingUnassignmentCount} awaiting review
                    </span>
                  ) : null}
                </div>
                {unassignmentItems.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
                    No pending unassignment requests.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {unassignmentItems.map((item) => (
                      <div
                        key={item.requestId}
                        className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden border-l-4 border-l-amber-300 p-4 sm:p-5"
                      >
                        <div className="flex flex-col lg:flex-row gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <h3 className="text-lg font-bold text-blue-900">{item.visitTitle}</h3>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                              <span className="inline-flex items-center gap-1.5">
                                <User className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                                {item.clientName}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                                {item.dateLabel}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                                {item.timeLabel}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                                {item.locationLabel}
                              </span>
                            </div>
                            <div className="pt-1">
                              <span className="font-semibold text-gray-900">{item.caregiverName}</span>
                              <span className="text-sm text-gray-600"> — {item.caregiverTitle}</span>
                            </div>
                            <p className="text-xs text-gray-400">Requested {item.requestedAtLabel}</p>
                          </div>
                          <div className="flex lg:flex-col gap-2 shrink-0 lg:items-stretch">
                            <button
                              type="button"
                              disabled={requestActionBusy(item.requestId, 'unassignment')}
                              onClick={() => handleApproveUnassign(item.requestId)}
                              className="inline-flex flex-1 lg:flex-none items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {pendingActionKey === `approve-unassign:${item.requestId}` ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  Approving...
                                </>
                              ) : (
                                <>
                                  <ThumbsUp className="h-4 w-4" aria-hidden />
                                  Approve Unassign
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={requestActionBusy(item.requestId, 'unassignment')}
                              onClick={() =>
                                setDeclineModal({
                                  requestId: item.requestId,
                                  caregiverName: item.caregiverName,
                                  clientName: item.clientName,
                                  kind: 'unassignment',
                                })
                              }
                              className="inline-flex flex-1 lg:flex-none items-center justify-center gap-2 rounded-lg border-2 border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                            >
                              {pendingActionKey === `decline-unassign:${item.requestId}` ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  Declining...
                                </>
                              ) : (
                                <>
                                  <ThumbsDown className="h-4 w-4" aria-hidden />
                                  Decline
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">Assignment Requests</h2>
                  {pendingAssignmentCount > 0 ? (
                    <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      {pendingAssignmentCount} awaiting review
                    </span>
                  ) : null}
                </div>
                {visits.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
                    No pending assignment requests.
                  </div>
                ) : (
              <div className="space-y-6">
                {visits.map((visit) => (
                  <div key={visit.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden border-l-4 border-l-amber-300">
                    <div className="bg-amber-50/60 px-4 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-amber-100/80">
                      <div>
                        <h3 className="text-lg font-bold text-blue-900">{visit.visitTitle}</h3>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                          <span className="inline-flex items-center gap-1.5"><User className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />{visit.clientName}</span>
                          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />{visit.dateLabel}</span>
                          <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />{visit.timeLabel}</span>
                          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />{visit.locationLabel}</span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-orange-100 text-orange-800 text-xs font-semibold px-3 py-1">{visit.requests.length} caregiver{visit.requests.length === 1 ? '' : 's'} requested</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {visit.requests.map((req, index) => {
                        const rank = index + 1
                        const isBest = rank === 1 && visit.requests.length > 1
                        return (
                          <div key={req.id} className="p-4 sm:p-5">
                            <div className="flex flex-col lg:flex-row gap-4">
                              <div className="flex gap-3 flex-1 min-w-0">
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rank === 1 ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-700'}`}>#{rank}</div>
                                <div className="min-w-0 flex-1 space-y-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-gray-900">{req.caregiverName}</span>
                                    <span className="text-sm text-gray-600">{req.caregiverTitle}</span>
                                    {isBest ? <span className="text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5">Best Match</span> : null}
                                  </div>
                                  <div className="grid sm:grid-cols-1 gap-3 max-w-md">
                                    <ProgressRow label="Overall Score" value={req.overallPercent} barClass="bg-blue-500" />
                                    <ProgressRow label="Skill Match" value={req.skillMatchPercent} barClass="bg-violet-500" />
                                    <ProgressRow label="Proximity" value={req.proximityPercent} barClass="bg-emerald-500" />
                                  </div>
                                  {req.matchedSkills.length > 0 ? <div className="flex flex-wrap gap-2">{req.matchedSkills.map((sk) => <span key={sk} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-md px-2 py-0.5"><CheckCircle2 className="h-3 w-3" aria-hidden /> {sk}</span>)}</div> : null}
                                  <p className="text-xs text-gray-600 inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{formatDistance(req.distanceMiles)} away - {req.cityLabel}</p>
                                  {req.note ? <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-sm text-sky-950"><span className="font-medium text-sky-900">Note: </span>{req.note}</div> : null}
                                  <p className="text-xs text-gray-400">Requested {req.requestedAtLabel}</p>
                                </div>
                              </div>
                              <div className="flex lg:flex-col gap-2 shrink-0 lg:items-stretch">
                                <button
                                  type="button"
                                  disabled={requestActionBusy(req.id)}
                                  onClick={() => handleApprove(req)}
                                  className="inline-flex flex-1 lg:flex-none items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {pendingActionKey === `approve:${req.id}` ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                      Approving...
                                    </>
                                  ) : (
                                    <>
                                      <ThumbsUp className="h-4 w-4" aria-hidden />
                                      Approve & Assign
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={requestActionBusy(req.id)}
                                  onClick={() =>
                                    setDeclineModal({
                                      requestId: req.id,
                                      caregiverName: req.caregiverName,
                                      clientName: visit.clientName,
                                      kind: 'assignment',
                                    })
                                  }
                                  className="inline-flex flex-1 lg:flex-none items-center justify-center gap-2 rounded-lg border-2 border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                                >
                                  {pendingActionKey === `decline:${req.id}` ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                      Declining...
                                    </>
                                  ) : (
                                    <>
                                      <ThumbsDown className="h-4 w-4" aria-hidden />
                                      Decline
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
                )}
              </>
            )}
          </div>
          {visibleResolved.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/80"><RefreshCw className="h-4 w-4 text-gray-500" aria-hidden /><h2 className="text-sm font-semibold text-gray-800">Recently Resolved</h2></div>
              <ul className="divide-y divide-gray-100">
                {visibleResolved.map((row) => (
                  <li key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 text-sm">
                    <div className="flex items-start gap-3 flex-1 min-w-0">{row.kind === 'approved' ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden /> : <XCircle className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" aria-hidden />}<div className="min-w-0"><span className="font-medium text-gray-900">{row.caregiverName}</span><span className="text-gray-600"> — {row.visitTitle} — {row.clientName} — {row.visitDateLabel}</span></div></div>
                    <div className="flex items-center gap-2 sm:shrink-0 pl-8 sm:pl-0"><span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${row.kind === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>{row.kind === 'approved' ? 'Approved' : 'Declined'}</span><span className="text-xs text-gray-500">{row.resolvedAtLabel}</span></div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <DeclineAssignmentModal
        isOpen={!!declineModal}
        onClose={() => setDeclineModal(null)}
        caregiverName={declineModal?.caregiverName ?? ''}
        clientName={declineModal?.clientName ?? ''}
        onConfirm={confirmDecline}
        variant={declineModal?.kind === 'unassignment' ? 'unassignment' : 'assignment'}
      />

      <Modal isOpen={!!detailVisit} onClose={() => setDetailVisit(null)} title="Visit Details" size="md">
        {detailVisit ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>{detailVisit.clientName}</span>
              <span>-</span>
              <span>{detailVisit.dateLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${visitStatusBadgeClass(detailVisit.status)}`}>{detailVisit.statusLabel}</span>
              <span className="rounded-full border border-blue-200 text-blue-700 px-2 py-0.5 text-xs">{detailVisit.typeLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Client</div><div className="font-semibold">{detailVisit.clientName}</div></div>
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Location</div><div className="font-semibold">{detailVisit.locationLabel}</div></div>
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Time</div><div className="font-semibold">{detailVisit.timeLabel}</div></div>
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Caregiver</div><div className="font-semibold">{detailVisit.caregiverName ?? '-'}</div></div>
            </div>
            <div><div className="text-xs text-gray-500 mb-1">ADL Tasks</div><div className="flex flex-wrap gap-2">{detailVisit.adlTasks.length ? detailVisit.adlTasks.map((task) => <span key={task} className="rounded-full border border-purple-200 text-purple-700 bg-purple-50 px-2 py-0.5 text-xs">{task}</span>) : <span className="text-sm text-gray-500">No ADL tasks</span>}</div></div>
            {detailVisit.status !== 'completed' && detailVisit.status !== 'missed' && !isPastVisitDate(detailVisit.date) ? (
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setMissVisit(detailVisit)} className="rounded-lg border border-orange-200 text-orange-700 px-3 py-2 text-sm font-medium hover:bg-orange-50">Mark Missed</button>
                <button type="button" onClick={() => void openReassignModal(detailVisit)} className="rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700">{detailVisit.caregiverId ? 'Reassign Caregiver' : 'Assign Caregiver'}</button>
              </div>
            ) : null}
            {canManageNotes && agencyId && (
              <div className="pt-2">
                <InternalNotesPanel
                  subjectType="visit"
                  subjectId={detailVisit.id}
                  agencyId={agencyId}
                  canManage={canManageNotes}
                />
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={!!reassignVisit} onClose={() => { setReassignVisit(null); setCandidates([]) }} title="Assign Caregiver" size="lg">
        {reassignVisit ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">{reassignVisit.clientName} - {reassignVisit.visitTitle} - {reassignVisit.timeLabel}</div>
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
              <div className="text-xs font-semibold text-purple-700 mb-2">Client Required Skills</div>
              <div className="flex flex-wrap gap-2">{reassignVisit.clientRequiredSkills.length ? reassignVisit.clientRequiredSkills.map((sk) => <span key={sk} className="rounded-full bg-white border border-purple-200 text-purple-700 px-2 py-0.5 text-xs">{sk}</span>) : <span className="text-xs text-purple-600">No required skills</span>}</div>
            </div>
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {loadingCandidates ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500 gap-2">
                  <Loader2 className="animate-spin w-4 h-4" />
                  Loading caregivers…
                </div>
              ) : candidates.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">No caregivers within 20 miles found.</div>
              ) : null}
              {!loadingCandidates && candidates.map((cand: ReassignCandidateDTO, idx) => (
                <div key={cand.id} className={`rounded-xl border p-3 ${cand.isCurrent ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-700">#{idx + 1}</span><span className="font-semibold text-gray-900">{cand.caregiverName}</span><span className="text-sm text-gray-600">{cand.caregiverTitle}</span>{cand.isCurrent ? <span className="rounded-full border border-blue-200 text-blue-700 bg-blue-100 px-2 py-0.5 text-xs">Currently Assigned</span> : null}</div>
                      <div className="max-w-sm mt-2"><ProgressRow label="Overall Score" value={cand.overallPercent} barClass="bg-blue-500" /><ProgressRow label="Skill Match" value={cand.skillMatchPercent} barClass="bg-violet-500" /><ProgressRow label="Proximity" value={cand.proximityPercent} barClass="bg-emerald-500" /></div>
                      <div className="mt-2 text-xs text-gray-600">{formatDistance(cand.distanceMiles)} away</div>
                      {cand.matchedSkills.length ? <div className="flex flex-wrap gap-2 mt-2">{cand.matchedSkills.map((sk) => <span key={sk} className="rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 px-2 py-0.5 text-xs">{sk}</span>)}</div> : null}
                    </div>
                    <button
                      type="button"
                      disabled={pendingActionKey === `assign:${reassignVisit.id}`}
                      onClick={() => {
                        if (cand.isCurrent) {
                          setReassignVisit(null)
                        } else {
                          handleAssign(reassignVisit, cand.id)
                        }
                      }}
                      className={`rounded-lg text-white px-3 py-2 text-sm font-medium disabled:opacity-60 ${cand.isCurrent ? 'bg-blue-600 hover:bg-blue-700' : 'bg-black hover:bg-gray-800 '}`}
                    >
                      {cand.isCurrent ? 'Keep' : 'Assign'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={!!missVisit} onClose={() => { setMissVisit(null); setMissReason('') }} title="Mark Visit as Missed" size="md">
        {missVisit ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <div className="font-semibold">{missVisit.clientName}</div>
              <div>{missVisit.visitTitle}</div>
              <div>{missVisit.dateLabel}, {missVisit.timeLabel}</div>
              <div>Caregiver: {missVisit.caregiverName ?? 'Unassigned'}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Reason (optional)</label>
              <textarea value={missReason} onChange={(e) => setMissReason(e.target.value)} placeholder="e.g. Client hospitalized, caregiver no-show, weather..." rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">This will be logged with your name and timestamp and will appear in missed-visit reports.</div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setMissVisit(null); setMissReason('') }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">Cancel</button>
              <button
                type="button"
                disabled={missVisit != null && pendingActionKey === `miss:${missVisit.id}`}
                onClick={handleMiss}
                className="rounded-lg bg-orange-600 text-white px-4 py-2 text-sm font-medium hover:bg-orange-700 disabled:opacity-60"
              >
                Confirm Missed
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
