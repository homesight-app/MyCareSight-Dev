'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  ClipboardList,
  Clock3,
  Eye,
  FileText,
  History,
  List,
  Loader2,
  MapPin,
  Play,
  Send,
  UserMinus,
} from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import Tabs from '@/components/ui/Tabs'
import SearchInput from '@/components/ui/SearchInput'
import { useRouter } from 'next/navigation'
import { getCaregiverPastVisitSummaryAction } from '@/app/actions/caregiver-visit-execution'
import {
  cancelScheduleAssignmentRequestAction,
  cancelScheduleUnassignmentRequestAction,
  markScheduleMissedAction,
  requestScheduleAssignmentAction,
  submitScheduleUnassignmentRequestAction,
} from '@/app/actions/schedule-assignment-requests'
import type { CaregiverPastVisitSummaryDTO } from '@/lib/caregiver-visit-execution'
import {
  isVisitPastForCaregiverMyVisits,
  MY_CARE_VISITS_TAB_STORAGE_KEY,
  type CaregiverVisitCardDTO,
} from '@/lib/caregiver-care-visits'
import Modal from '@/components/Modal'

type Props = {
  visits: CaregiverVisitCardDTO[]
  mineCount: number
  openCount: number
  todayCount: number
}

type MainTab = 'my_visits' | 'scheduling'
type MyVisitsTab = 'upcoming' | 'in_progress' | 'past'

type SchedulingTab = 'all' | 'open' | 'mine' | 'requests'
type SchedulingView = 'list' | 'calendar'
type MyVisitsUpcomingView = 'list' | 'calendar'

function isTodayDateStr(date: string): boolean {
  const t = new Date()
  const d = new Date(`${date}T00:00:00`)
  return (
    d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
  )
}

function pastListDateBadge(isoDate: string): { month: string; dayNum: number } {
  const d = new Date(`${isoDate}T12:00:00`)
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    dayNum: d.getDate(),
  }
}

function weekStartSunday(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** e.g. "Apr 5 – Apr 11, 2026" for the Sun–Sat week starting at `weekStart`. */
function formatCalendarWeekRangeLabel(weekStart: Date): string {
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameYear = start.getFullYear() === end.getFullYear()
  const left = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const right = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (sameYear) {
    return `${left} – ${right}`
  }
  const leftFull = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${leftFull} – ${right}`
}

function statusBadgeClass(status: CaregiverVisitCardDTO['status']): string {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700'
  if (status === 'missed') return 'bg-orange-50 text-orange-700'
  if (status === 'in_progress') return 'bg-blue-50 text-blue-700'
  if (status === 'open') return 'bg-sky-50 text-sky-700'
  return 'bg-green-50 text-green-700'
}

export default function CaregiverMyCareVisitsContent({
  visits,
  mineCount,
  openCount,
  todayCount,
}: Props) {
  const router = useRouter()
  const [mainTab, setMainTab] = useState<MainTab>('my_visits')
  const [myVisitsTab, setMyVisitsTab] = useState<MyVisitsTab>('upcoming')
  const [schedulingTab, setSchedulingTab] = useState<SchedulingTab>('all')
  const [schedulingView, setSchedulingView] = useState<SchedulingView>('list')
  const [search, setSearch] = useState('')
  const [statsOpen, setStatsOpen] = useState(false)
  const statsDropdownRef = useRef<HTMLDivElement>(null)
  /** Scoped pending key so one visit's request/cancel/unassign/missed does not disable all rows. */
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)
  const [summaryPending, startSummaryTransition] = useTransition()
  /** Shared pending state for navigating to `/my-care-visits/[id]` (Start Visit or View Details). */
  const [visitPageNavPending, visitPageNavTransition] = useTransition()
  const [visitPageNavId, setVisitPageNavId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visitSummaryOpen, setVisitSummaryOpen] = useState(false)
  const [visitSummary, setVisitSummary] = useState<CaregiverPastVisitSummaryDTO | null>(null)
  const [visitSummaryError, setVisitSummaryError] = useState<string | null>(null)
  const [requestModalVisit, setRequestModalVisit] = useState<CaregiverVisitCardDTO | null>(null)
  const [requestNoteDraft, setRequestNoteDraft] = useState('')
  const [unassignModalVisit, setUnassignModalVisit] = useState<CaregiverVisitCardDTO | null>(null)
  /** Sunday 00:00 of the week shown in Scheduling → Calendar. */
  useEffect(() => {
    if (!statsOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const root = statsDropdownRef.current
      if (!root || root.contains(e.target as Node)) return
      setStatsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [statsOpen])

  /** After "Start Visit" / Back, restore My Visits sub-tab from storage. */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MY_CARE_VISITS_TAB_STORAGE_KEY)
      if (raw === 'upcoming' || raw === 'in_progress' || raw === 'past') {
        setMyVisitsTab(raw)
        sessionStorage.removeItem(MY_CARE_VISITS_TAB_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!visitPageNavPending && visitPageNavId) {
      setVisitPageNavId(null)
    }
  }, [visitPageNavPending, visitPageNavId])

  const handleViewDetailsNavigate = (visitId: string) => {
    setVisitPageNavId(visitId)
    visitPageNavTransition(() => {
      router.push(`/pages/caregiver/my-care-visits/${visitId}`)
    })
  }

  const [calendarWeekStart, setCalendarWeekStart] = useState<Date>(() => weekStartSunday())
  const [myVisitsUpcomingView, setMyVisitsUpcomingView] = useState<MyVisitsUpcomingView>('list')
  const [upcomingCalendarWeekStart, setUpcomingCalendarWeekStart] = useState<Date>(() => weekStartSunday())

  const filteredBySearch = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visits
    return visits.filter((v) => `${v.clientName} ${v.serviceName} ${v.locationLine} ${v.locationShort}`.toLowerCase().includes(q))
  }, [search, visits])

  /** Assigned upcoming visits (DB not in progress yet — clock-in moves them to In Progress). */
  const upcomingMineVisits = useMemo(
    () =>
      filteredBySearch.filter(
        (v) => v.isMine && !isVisitPastForCaregiverMyVisits(v) && v.status !== 'in_progress'
      ),
    [filteredBySearch]
  )
  /** DB `in_progress` (after confirmed clock-in). */
  const inProgressMineVisits = useMemo(
    () =>
      filteredBySearch.filter(
        (v) => v.isMine && !isVisitPastForCaregiverMyVisits(v) && v.status === 'in_progress'
      ),
    [filteredBySearch]
  )
  const todayMineCount = useMemo(
    () =>
      filteredBySearch.filter(
        (v) => v.isMine && !isVisitPastForCaregiverMyVisits(v) && isTodayDateStr(v.date)
      ).length,
    [filteredBySearch]
  )
  const pastMineVisits = useMemo(
    () => filteredBySearch.filter((v) => v.isMine && isVisitPastForCaregiverMyVisits(v)),
    [filteredBySearch]
  )

  const schedulingList = useMemo(() => {
    const upcoming = filteredBySearch.filter((v) => !isVisitPastForCaregiverMyVisits(v))
    if (schedulingTab === 'open') return upcoming.filter((v) => v.status === 'open')
    if (schedulingTab === 'mine') {
      return upcoming.filter((v) => v.isMine && !v.hasPendingUnassignmentRequest)
    }
    if (schedulingTab === 'requests') {
      return upcoming.filter((v) => v.hasMyPendingRequest || v.hasPendingUnassignmentRequest)
    }
    return upcoming.filter((v) => v.status === 'open' || v.isMine)
  }, [filteredBySearch, schedulingTab])

  const myRequestsTabCount = useMemo(
    () =>
      filteredBySearch.filter(
        (v) =>
          !isVisitPastForCaregiverMyVisits(v) &&
          (v.hasMyPendingRequest || v.hasPendingUnassignmentRequest)
      ).length,
    [filteredBySearch]
  )

  const completedTasksCount = useMemo(
    () => pastMineVisits.reduce((sum, row) => sum + row.adlTasksCompleted, 0),
    [pastMineVisits]
  )

  const visitSummaryTasksByCategory = useMemo(() => {
    if (!visitSummary?.tasks.length) return []
    const m = new Map<string, CaregiverPastVisitSummaryDTO['tasks']>()
    for (const t of visitSummary.tasks) {
      const list = m.get(t.categoryLabel) ?? []
      list.push(t)
      m.set(t.categoryLabel, list)
    }
    return Array.from(m.entries())
  }, [visitSummary])

  const visitSummaryTaskProgress = useMemo(() => {
    if (!visitSummary?.tasks.length) return { done: 0, total: 0, pct: 0 }
    const total = visitSummary.tasks.length
    const done = visitSummary.tasks.filter((t) => t.completed).length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { done, total, pct }
  }, [visitSummary])

  const openVisitSummary = (visitId: string) => {
    setVisitSummaryOpen(true)
    setVisitSummary(null)
    setVisitSummaryError(null)
    startSummaryTransition(async () => {
      const res = await getCaregiverPastVisitSummaryAction(visitId)
      if ('error' in res) {
        setVisitSummaryError(res.error)
        return
      }
      setVisitSummary(res.summary)
    })
  }

  const closeVisitSummary = () => {
    setVisitSummaryOpen(false)
    setVisitSummary(null)
    setVisitSummaryError(null)
  }

  const calendarWeek = useMemo(() => {
    const start = new Date(calendarWeekStart)
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start)
      d.setDate(start.getDate() + idx)
      return d
    })
  }, [calendarWeekStart])

  const calendarRangeLabel = useMemo(() => formatCalendarWeekRangeLabel(calendarWeekStart), [calendarWeekStart])

  const calendarMap = useMemo(() => {
    const map = new Map<string, CaregiverVisitCardDTO[]>()
    for (const v of schedulingList) {
      const existing = map.get(v.date) ?? []
      existing.push(v)
      map.set(v.date, existing)
    }
    return map
  }, [schedulingList])

  const upcomingCalendarWeek = useMemo(() => {
    const start = new Date(upcomingCalendarWeekStart)
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start)
      d.setDate(start.getDate() + idx)
      return d
    })
  }, [upcomingCalendarWeekStart])

  const upcomingCalendarRangeLabel = useMemo(
    () => formatCalendarWeekRangeLabel(upcomingCalendarWeekStart),
    [upcomingCalendarWeekStart]
  )

  const upcomingCalendarMap = useMemo(() => {
    const map = new Map<string, CaregiverVisitCardDTO[]>()
    for (const v of upcomingMineVisits) {
      const existing = map.get(v.date) ?? []
      existing.push(v)
      map.set(v.date, existing)
    }
    return map
  }, [upcomingMineVisits])

  const openRequestModal = (visit: CaregiverVisitCardDTO) => {
    setError(null)
    setUnassignModalVisit(null)
    setRequestNoteDraft('')
    setRequestModalVisit(visit)
  }

  const closeRequestModal = () => {
    setRequestModalVisit(null)
    setRequestNoteDraft('')
  }

  const openUnassignModal = (visit: CaregiverVisitCardDTO) => {
    setError(null)
    setRequestModalVisit(null)
    setUnassignModalVisit(visit)
  }

  const closeUnassignModal = () => {
    setUnassignModalVisit(null)
  }

  const submitRequestFromModal = async () => {
    if (!requestModalVisit || requestModalVisit.hasMyPendingRequest) return
    const scheduleId = requestModalVisit.id
    const note = requestNoteDraft.trim() || null
    setError(null)
    const key = `request:${scheduleId}`
    setPendingActionKey(key)
    try {
      const res = await requestScheduleAssignmentAction(scheduleId, note)
      if (res.error) {
        setError(res.error)
        return
      }
      closeRequestModal()
      router.refresh()
    } finally {
      setPendingActionKey(null)
    }
  }

  const doCancelRequest = (requestId: string, onSuccess?: () => void) => {
    setError(null)
    const key = `cancel:${requestId}`
    setPendingActionKey(key)
    void (async () => {
      try {
        const res = await cancelScheduleAssignmentRequestAction(requestId)
        if (res.error) {
          setError(res.error)
          return
        }
        onSuccess?.()
        router.refresh()
      } finally {
        setPendingActionKey(null)
      }
    })()
  }

  const doUnassign = (scheduleId: string, onSuccess?: () => void) => {
    setError(null)
    const key = `unassign:${scheduleId}`
    setPendingActionKey(key)
    void (async () => {
      try {
        const res = await submitScheduleUnassignmentRequestAction(scheduleId)
        if (res.error) {
          setError(res.error)
          return
        }
        onSuccess?.()
        router.refresh()
      } finally {
        setPendingActionKey(null)
      }
    })()
  }

  const doCancelUnassignmentRequest = (requestId: string, onSuccess?: () => void) => {
    setError(null)
    const key = `cancel-unassign:${requestId}`
    setPendingActionKey(key)
    void (async () => {
      try {
        const res = await cancelScheduleUnassignmentRequestAction(requestId)
        if (res.error) {
          setError(res.error)
          return
        }
        onSuccess?.()
        router.refresh()
      } finally {
        setPendingActionKey(null)
      }
    })()
  }

  const submitUnassignFromModal = () => {
    if (!unassignModalVisit) return
    doUnassign(unassignModalVisit.id, closeUnassignModal)
  }

  const onCalendarVisitClick = (visit: CaregiverVisitCardDTO) => {
    if (visit.isMine && visit.status === 'in_progress') {
      router.push(`/pages/caregiver/my-care-visits/${visit.id}`)
      return
    }
    if (visit.isMine && visit.status !== 'completed' && visit.status !== 'missed') {
      openUnassignModal(visit)
      return
    }
    if (visit.status === 'open') {
      openRequestModal(visit)
    }
  }

  const listToRender =
    mainTab === 'my_visits'
      ? myVisitsTab === 'upcoming'
        ? upcomingMineVisits
        : myVisitsTab === 'in_progress'
          ? inProgressMineVisits
          : pastMineVisits
      : schedulingList

  const doMarkMissed = (visitId: string) => {
    if (!window.confirm('Mark this visit as missed?')) return
    setError(null)
    const key = `missed:${visitId}`
    setPendingActionKey(key)
    void (async () => {
      try {
        const res = await markScheduleMissedAction(visitId)
        if (res.error) {
          setError(res.error)
          return
        }
        router.refresh()
      } finally {
        setPendingActionKey(null)
      }
    })()
  }

  const showSchedulingCalendar = mainTab === 'scheduling' && schedulingView === 'calendar'
  const showUpcomingCalendar = mainTab === 'my_visits' && myVisitsTab === 'upcoming' && myVisitsUpcomingView === 'calendar'
  const showListBelow = !showSchedulingCalendar && !showUpcomingCalendar

  return (
    <div className="space-y-5 mt-20">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Care Visits</h1>
        <p className="text-sm text-gray-600">Manage your visits, schedule, and availability</p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <Modal
        isOpen={!!requestModalVisit}
        onClose={closeRequestModal}
        size="md"
        title={
          requestModalVisit?.hasMyPendingRequest ? (
            <span className="inline-flex items-center gap-2 text-gray-900">
              <FileText className="h-5 w-5 shrink-0 text-gray-600" aria-hidden />
              Visit details
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-blue-700">
              <Send className="h-5 w-5 shrink-0" aria-hidden />
              Request Visit Assignment
            </span>
          )
        }
        subtitle={
          requestModalVisit?.hasMyPendingRequest
            ? 'Your assignment request is pending coordinator review. You will be notified of their decision.'
            : 'Your request will be sent to the Care Coordinator for review. You will be notified of their decision.'
        }
      >
        {requestModalVisit ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-gray-800 space-y-2">
              <div>
                <span className="font-medium text-gray-600">Client: </span>
                {requestModalVisit.clientName}
              </div>
              <div>
                <span className="font-medium text-gray-600">Date: </span>
                {requestModalVisit.dateLabelLong}
              </div>
              <div>
                <span className="font-medium text-gray-600">Time: </span>
                {requestModalVisit.timeLabel}
              </div>
              <div>
                <span className="font-medium text-gray-600">Service: </span>
                {requestModalVisit.serviceName}
              </div>
              <div>
                <span className="font-medium text-gray-600">Address: </span>
                {requestModalVisit.locationLine !== '-' ? requestModalVisit.locationLine : requestModalVisit.locationShort}
              </div>
            </div>

            {requestModalVisit.adlTasks.length > 0 ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50/80 px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-800">
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  ADL Tasks ({requestModalVisit.adlTasks.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {requestModalVisit.adlTasks.map((task, idx) => (
                    <span
                      key={`modal-${requestModalVisit.id}-${idx}`}
                      className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200"
                    >
                      {task}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {requestModalVisit.hasMyPendingRequest ? (
              <>
                {requestModalVisit.myRequestNote ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
                    <span className="font-medium text-sky-800">Your note to coordinator: </span>
                    {requestModalVisit.myRequestNote}
                  </div>
                ) : null}
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  <Clock3 className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" aria-hidden />
                  <p>Request pending — you cannot submit another request for this visit until the coordinator decides.</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="request-coordinator-note" className="mb-1 block text-sm font-medium text-gray-900">
                    Note to Coordinator (optional)
                  </label>
                  <textarea
                    id="request-coordinator-note"
                    value={requestNoteDraft}
                    onChange={(e) => setRequestNoteDraft(e.target.value)}
                    rows={3}
                    placeholder="e.g. I have experience with this client, I'm available all day, I live nearby..."
                    className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>

                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" aria-hidden />
                  <p>
                    Other caregivers may also request this visit. The coordinator will choose and all parties will be notified.
                  </p>
                </div>
              </>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
              {requestModalVisit.hasMyPendingRequest ? (
                <>
                  <button
                    type="button"
                    onClick={closeRequestModal}
                    disabled={
                      !!requestModalVisit.myPendingRequestId &&
                      pendingActionKey === `cancel:${requestModalVisit.myPendingRequestId}`
                    }
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Close
                  </button>
                  {requestModalVisit.myPendingRequestId ? (
                    <button
                      type="button"
                      onClick={() =>
                        doCancelRequest(requestModalVisit.myPendingRequestId!, closeRequestModal)
                      }
                      disabled={pendingActionKey === `cancel:${requestModalVisit.myPendingRequestId}`}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Cancel Request
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={closeRequestModal}
                    disabled={pendingActionKey === `request:${requestModalVisit.id}`}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => void submitRequestFromModal()}
                    disabled={pendingActionKey === `request:${requestModalVisit.id}`}
                    icon={Send}
                  >
                    Submit Request
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!unassignModalVisit}
        onClose={closeUnassignModal}
        size="md"
        title="Confirm Unassignment"
      >
        {unassignModalVisit ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-900">
              Request to be removed from this visit. Your care coordinator will approve or decline; you stay assigned
              until it is approved.
            </p>
            <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-sm text-gray-900 space-y-2">
              <div className="text-base font-semibold text-amber-900">{unassignModalVisit.clientName}</div>
              <div>{unassignModalVisit.dateLabelLong}</div>
              <div>{unassignModalVisit.timeLabel.replace(' - ', ' – ')}</div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                type="button"
                onClick={closeUnassignModal}
                disabled={pendingActionKey === `unassign:${unassignModalVisit.id}`}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={submitUnassignFromModal}
                disabled={pendingActionKey === `unassign:${unassignModalVisit.id}`}
                icon={UserMinus}
              >
                Send Request
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={visitSummaryOpen}
        onClose={closeVisitSummary}
        size="lg"
        title={
          <span className="inline-flex items-center gap-2 text-gray-900">
            <History className="h-5 w-5 shrink-0 text-gray-600" aria-hidden />
            Visit Summary
          </span>
        }
        subtitle={
          visitSummary
            ? `${visitSummary.clientName} — ${visitSummary.dateSubtitle}`
            : visitSummaryError
              ? 'Could not load summary'
              : 'Loading…'
        }
      >
        {visitSummaryError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{visitSummaryError}</div>
        ) : null}
        {summaryPending && !visitSummary && !visitSummaryError ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading visit summary…</div>
        ) : null}
        {visitSummary ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Service Type</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{visitSummary.serviceName}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Location</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{visitSummary.locationShort}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  Clock In
                </div>
                <div className="mt-1 text-lg font-semibold text-emerald-900">
                  {visitSummary.clockInLabel ?? '—'}
                </div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-900">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />
                  Clock Out
                </div>
                <div className="mt-1 text-lg font-semibold text-red-900">
                  {visitSummary.clockOutLabel ?? '—'}
                </div>
              </div>
            </div>

            {visitSummary.tasks.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-violet-900">
                    <ClipboardList className="h-4 w-4 text-violet-600" aria-hidden />
                    ADL Task Completion
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {visitSummaryTaskProgress.done}/{visitSummaryTaskProgress.total} ({visitSummaryTaskProgress.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${visitSummaryTaskProgress.pct}%` }}
                  />
                </div>

                <div className="mt-4 space-y-5">
                  {visitSummaryTasksByCategory.map(([category, tasks]) => (
                    <div key={category}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</div>
                      <ul className="space-y-3">
                        {tasks.map((task) => (
                          <li
                            key={task.id}
                            className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              {task.completed ? (
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-emerald-300 bg-emerald-50">
                                  <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} aria-hidden />
                                </span>
                              ) : (
                                <span
                                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-amber-400 bg-amber-50/60"
                                  aria-hidden
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-gray-900">{task.name}</span>
                                  {!task.completed ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                      Not completed
                                    </span>
                                  ) : null}
                                  {task.completed && task.completedAtLabel ? (
                                    <span className="text-xs text-gray-500">{task.completedAtLabel}</span>
                                  ) : null}
                                </div>
                                {task.instructions ? (
                                  <p className="mt-1 text-sm italic text-gray-600">&quot;{task.instructions}&quot;</p>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                No ADL tasks were recorded for this visit.
              </div>
            )}

            {visitSummary.caregiverNotes ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-sky-900">
                  <FileText className="h-4 w-4" aria-hidden />
                  Visit Notes
                </div>
                <p className="text-sm text-sky-950 whitespace-pre-wrap">{visitSummary.caregiverNotes}</p>
              </div>
            ) : null}
            {visitSummary.scheduleNotes ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule notes</div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{visitSummary.scheduleNotes}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Tabs
        variant="pill"
        active={mainTab}
        onChange={(k) => setMainTab(k as MainTab)}
        items={[
          { key: 'my_visits', label: 'My Visits', count: mineCount },
          { key: 'scheduling', label: 'Scheduling', count: openCount + mineCount },
        ]}
      />

      {mainTab === 'my_visits' ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              variant="pill"
              active={myVisitsTab}
              onChange={(k) => setMyVisitsTab(k as MyVisitsTab)}
              items={[
                { key: 'upcoming', label: 'Upcoming', count: upcomingMineVisits.length },
                { key: 'in_progress', label: 'In Progress', count: inProgressMineVisits.length },
                { key: 'past', label: 'Past Visits', count: pastMineVisits.length },
              ]}
            />
            {myVisitsTab === 'upcoming' ? (
              <Tabs
                variant="pill"
                active={myVisitsUpcomingView}
                onChange={(k) => setMyVisitsUpcomingView(k as MyVisitsUpcomingView)}
                items={[
                  { key: 'list', label: 'List' },
                  { key: 'calendar', label: 'Calendar' },
                ]}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {myVisitsTab === 'upcoming' ? (
              <>
                <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-700">
                  {upcomingMineVisits.length} upcoming
                </span>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">{todayMineCount} today</span>
              </>
            ) : myVisitsTab === 'in_progress' ? (
              <>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-800">
                  {inProgressMineVisits.length} in progress
                </span>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">
                  {inProgressMineVisits.filter((v) => isTodayDateStr(v.date)).length} today
                </span>
              </>
            ) : (
              <>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">{pastMineVisits.length} completed</span>
                <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-700">{completedTasksCount} tasks completed</span>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-700">Browse open visits and assign or unassign yourself.</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[250px] grow">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search by client, service type, or location..."
              />
            </div>

            <div className="relative" ref={statsDropdownRef}>
              <button type="button" onClick={() => setStatsOpen((v) => !v)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                Stats <span className="ml-1 text-blue-600">{openCount}</span> <span className="ml-1 text-green-600">{mineCount}</span>
              </button>
              {statsOpen ? (
                <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                  <div className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900">Open Visits <span className="float-right font-semibold">{openCount}</span></div>
                  <div className="mt-2 rounded-lg bg-green-50 p-2 text-sm text-green-900">My Assigned <span className="float-right font-semibold">{mineCount}</span></div>
                  <div className="mt-2 rounded-lg bg-violet-50 p-2 text-sm text-violet-900">Today&apos;s Visits <span className="float-right font-semibold">{todayCount}</span></div>
                </div>
              ) : null}
            </div>

            <Tabs
              variant="pill"
              active={schedulingView}
              onChange={(k) => setSchedulingView(k as SchedulingView)}
              items={[
                { key: 'list', label: 'List' },
                { key: 'calendar', label: 'Calendar' },
              ]}
            />
          </div>

          <Tabs
            variant="pill"
            active={schedulingTab}
            onChange={(k) => setSchedulingTab(k as SchedulingTab)}
            items={[
              { key: 'all', label: 'All', count: openCount + mineCount },
              { key: 'open', label: 'Open', count: openCount },
              { key: 'mine', label: 'Mine', count: mineCount },
              { key: 'requests', label: 'My Requests', count: myRequestsTabCount },
            ]}
          />
        </>
      )}

      {showSchedulingCalendar ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{calendarRangeLabel}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarWeekStart(weekStartSunday())}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Today
              </button>
              <div className="inline-flex rounded-md border border-gray-300 bg-white">
                <button
                  type="button"
                  aria-label="Previous week"
                  onClick={() => {
                    const d = new Date(calendarWeekStart)
                    d.setDate(d.getDate() - 7)
                    setCalendarWeekStart(weekStartSunday(d))
                  }}
                  className="rounded-l-md border-r border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next week"
                  onClick={() => {
                    const d = new Date(calendarWeekStart)
                    d.setDate(d.getDate() + 7)
                    setCalendarWeekStart(weekStartSunday(d))
                  }}
                  className="rounded-r-md p-1.5 text-gray-700 hover:bg-gray-50"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {calendarWeek.map((d) => {
              const key = dayKey(d)
              const items = calendarMap.get(key) ?? []
              return (
                <div key={key} className="rounded-lg border border-gray-200 p-2">
                  <div className="mb-2 text-xs font-semibold text-gray-600">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
                  </div>
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {items.map((visit) => {
                      const openClickable = visit.status === 'open'
                      const mineClickable = visit.isMine && visit.status !== 'completed' && visit.status !== 'missed'
                      const clickable = openClickable || mineClickable
                      return (
                        <button
                          key={visit.id}
                          type="button"
                          disabled={!clickable}
                          onClick={() => onCalendarVisitClick(visit)}
                          className={`w-full rounded border px-2 py-1 text-left text-xs transition ${visit.isMine ? 'border-green-300 bg-green-50' : 'border-sky-300 bg-sky-50'} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-gray-300' : 'cursor-default opacity-90'}`}
                        >
                          <div className="font-medium">{visit.clientName}</div>
                          <div>{visit.timeLabel}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {showUpcomingCalendar ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{upcomingCalendarRangeLabel}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setUpcomingCalendarWeekStart(weekStartSunday())}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Today
              </button>
              <div className="inline-flex rounded-md border border-gray-300 bg-white">
                <button
                  type="button"
                  aria-label="Previous week"
                  onClick={() => {
                    const d = new Date(upcomingCalendarWeekStart)
                    d.setDate(d.getDate() - 7)
                    setUpcomingCalendarWeekStart(weekStartSunday(d))
                  }}
                  className="rounded-l-md border-r border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next week"
                  onClick={() => {
                    const d = new Date(upcomingCalendarWeekStart)
                    d.setDate(d.getDate() + 7)
                    setUpcomingCalendarWeekStart(weekStartSunday(d))
                  }}
                  className="rounded-r-md p-1.5 text-gray-700 hover:bg-gray-50"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {upcomingCalendarWeek.map((d) => {
              const key = dayKey(d)
              const items = upcomingCalendarMap.get(key) ?? []
              return (
                <div key={key} className="rounded-lg border border-gray-200 p-2">
                  <div className="mb-2 text-xs font-semibold text-gray-600">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
                  </div>
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {items.map((visit) => (
                      <Link
                        key={visit.id}
                        href={`/pages/caregiver/my-care-visits/${visit.id}`}
                        className="block w-full rounded border border-green-300 bg-green-50 px-2 py-1 text-left text-xs transition hover:ring-2 hover:ring-gray-300"
                      >
                        <div className="font-medium">{visit.clientName}</div>
                        <div>{visit.timeLabel}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {showListBelow ? (
        <div className="space-y-4">
          {listToRender.map((visit) => {
            const pastMyVisitsRow = mainTab === 'my_visits' && myVisitsTab === 'past'
            if (pastMyVisitsRow) {
              const db = pastListDateBadge(visit.date)
              const total = visit.adlTasksTotal
              const done = visit.adlTasksCompleted
              const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
              return (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => openVisitSummary(visit.id)}
                  className="flex w-full items-stretch gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50/80"
                >
                  <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-gray-100 px-2 py-2 text-center">
                    <span className="text-[10px] font-semibold leading-tight text-gray-500">{db.month}</span>
                    <span className="text-xl font-bold leading-none text-gray-900">{db.dayNum}</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-gray-900">{visit.clientName}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {visit.serviceName}
                      </span>
                      {visit.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                          <CheckCircle2 className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                          Completed
                        </span>
                      ) : visit.status === 'missed' ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
                          <CircleX className="h-3.5 w-3.5" aria-hidden />
                          Missed
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(visit.status)}`}
                        >
                          {visit.status === 'in_progress' ? 'In Progress' : visit.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                        {visit.dateLabel}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                        {visit.timeRangeDisplay}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                        {visit.locationShort}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-0.5">
                      {total > 0 ? (
                        <>
                          <div className="h-2 min-w-[120px] flex-1 max-w-md rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs text-gray-500">
                            {done}/{total} ADL tasks
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">No ADL tasks</span>
                      )}
                      {visit.hasVisitNote ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                          <FileText className="h-3.5 w-3.5" aria-hidden />
                          Note
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center text-gray-300" aria-hidden>
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </button>
              )
            }

            return (
            <div key={visit.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-xl font-semibold text-gray-900">{visit.clientName}</div>
                    {mainTab === 'my_visits' && myVisitsTab === 'upcoming' ? (
                      visit.hasPendingUnassignmentRequest ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                          <Clock3 className="h-3.5 w-3.5" aria-hidden /> Request Pending
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Assigned to Me
                        </span>
                      )
                    ) : mainTab === 'my_visits' && myVisitsTab === 'in_progress' ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden /> In progress
                      </span>
                    ) : null}
                  </div>
                  <div className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{visit.serviceName}</div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4 text-gray-400" />{visit.dateLabel}</span>
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4 text-gray-400" />{visit.timeLabel} {visit.durationLabel}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 text-gray-400" />{visit.locationShort}</span>
                  </div>
                  {visit.locationLine !== '-' ? (
                    <div className="inline-flex items-start gap-1.5 text-sm text-gray-700">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                      <span>{visit.locationLine}</span>
                    </div>
                  ) : null}
                  {visit.notes ? (
                    <div className="rounded-md bg-sky-50 px-2 py-1 text-sm text-sky-900">Visit notes: {visit.notes}</div>
                  ) : null}
                  {visit.hasMyPendingRequest && visit.myRequestNote ? (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sm text-sky-900">
                      Notes: {visit.myRequestNote}
                    </div>
                  ) : null}
                  {visit.adlTasks.length > 0 ? (
                    <div className="rounded-md bg-violet-50 px-2 py-2">
                      <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-violet-700">
                    <ClipboardList className="h-4 w-4 text-violet-600" aria-hidden />
                    ADL Tasks ({visit.adlTasks.length})
                  </div>
                      <div className="flex flex-wrap gap-1.5">
                        {visit.adlTasks.map((task, idx) => (
                          <span key={`${visit.id}-adl-${idx}`} className="rounded-full bg-white px-2 py-0.5 text-xs text-violet-700 ring-1 ring-violet-200">
                            {task}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2 lg:flex-col lg:items-end">
                  {mainTab === 'my_visits' && myVisitsTab === 'upcoming' ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto lg:min-w-[11rem]">
                      {visit.status !== 'completed' &&
                      visit.status !== 'missed' &&
                      !visit.hasPendingUnassignmentRequest ? (
                        <Button
                          variant="primary"
                          type="button"
                          onClick={() => handleViewDetailsNavigate(visit.id)}
                          disabled={visitPageNavId === visit.id}
                          loading={!!(visitPageNavPending && visitPageNavId === visit.id)}
                          icon={Play}
                        >
                          Start Visit
                        </Button>
                      ) : null}
                      {visit.status !== 'completed' &&
                      visit.status !== 'missed' &&
                      !visit.hasPendingUnassignmentRequest ? (
                        <button
                          type="button"
                          onClick={() => doMarkMissed(visit.id)}
                          disabled={pendingActionKey === `missed:${visit.id}`}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                        >
                          <CircleX className="h-4 w-4" aria-hidden />
                          Mark Missed
                        </button>
                      ) : null}
                      {!visit.hasPendingUnassignmentRequest ? (
                        <button
                          type="button"
                          onClick={() => openUnassignModal(visit)}
                          disabled={
                            pendingActionKey === `unassign:${visit.id}` ||
                            visit.status === 'completed' ||
                            visit.status === 'missed'
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          <UserMinus className="h-4 w-4" aria-hidden />
                          Unassign
                        </button>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                          <Clock3 className="h-4 w-4" aria-hidden />
                          Unassignment Requested
                        </span>
                      )}
                    </div>
                  ) : mainTab === 'my_visits' && myVisitsTab === 'in_progress' ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto lg:min-w-[11rem]">
                      <Button
                        variant="primary"
                        type="button"
                        onClick={() => handleViewDetailsNavigate(visit.id)}
                        disabled={visitPageNavId === visit.id}
                        loading={!!(visitPageNavPending && visitPageNavId === visit.id)}
                        icon={Eye}
                      >
                        View Details
                      </Button>
                    </div>
                  ) : mainTab === 'scheduling' ? (
                    <div className="flex flex-col items-end gap-2 sm:min-w-[11rem]">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeClass(visit.status)}`}>
                          {visit.status === 'in_progress' ? 'In Progress' : visit.status === 'open' ? 'Open' : visit.status.replace('_', ' ')}
                        </span>
                        {visit.hasMyPendingRequest || visit.hasPendingUnassignmentRequest ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden />
                            Request Pending
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {visit.status === 'open' && !visit.hasMyPendingRequest ? (
                          <Button
                            variant="primary"
                            type="button"
                            onClick={() => openRequestModal(visit)}
                            disabled={pendingActionKey === `request:${visit.id}`}
                          >
                            Request Assignment
                          </Button>
                        ) : null}
                        {visit.hasMyPendingRequest && visit.myPendingRequestId ? (
                          <button
                            type="button"
                            onClick={() => doCancelRequest(visit.myPendingRequestId!)}
                            disabled={pendingActionKey === `cancel:${visit.myPendingRequestId}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Cancel Request
                          </button>
                        ) : null}
                        {visit.hasPendingUnassignmentRequest && visit.myPendingUnassignmentRequestId ? (
                          <button
                            type="button"
                            onClick={() => doCancelUnassignmentRequest(visit.myPendingUnassignmentRequestId!)}
                            disabled={pendingActionKey === `cancel-unassign:${visit.myPendingUnassignmentRequestId}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Cancel Request
                          </button>
                        ) : null}
                        {visit.isMine && !visit.hasPendingUnassignmentRequest ? (
                          <button
                            type="button"
                            onClick={() => openUnassignModal(visit)}
                            disabled={
                              pendingActionKey === `unassign:${visit.id}` ||
                              visit.status === 'completed' ||
                              visit.status === 'missed'
                            }
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            Unassign
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Assigned to Me
                    </span>
                  )}
                </div>
              </div>
            </div>
            )
          })}
          {listToRender.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
              {mainTab === 'my_visits' && myVisitsTab === 'in_progress'
                ? 'No visits in progress.'
                : 'No visits found.'}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
