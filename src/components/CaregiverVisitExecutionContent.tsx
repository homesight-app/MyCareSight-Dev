'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  Clock3,
  Loader2,
  LogIn,
  MapPin,
  Navigation,
  Signal,
  Timer,
} from 'lucide-react'
import type { CaregiverVisitExecutionDTO } from '@/lib/caregiver-visit-execution'
import { MY_CARE_VISITS_TAB_STORAGE_KEY } from '@/lib/caregiver-care-visits'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import Tabs from '@/components/ui/Tabs'
import {
  caregiverClockInAction,
  caregiverClockOutAction,
  caregiverSaveVisitNotesAction,
  caregiverSetTaskCompletedAction,
} from '@/app/actions/caregiver-visit-execution'

type Props = {
  initial: CaregiverVisitExecutionDTO
}

type TabId = 'tasks' | 'notes'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Elapsed ms → H:MM:SS (hours can exceed two digits for long visits). */
function formatElapsedHms(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${pad2(m)}:${pad2(s)}`
}

/** Parse "(120 min)" from durationLabel. */
function parseScheduledMinutes(durationLabel: string): number | null {
  const m = durationLabel.match(/\((\d+)\s*min\)/i)
  if (!m) return null
  const n = parseInt(m[1]!, 10)
  return Number.isFinite(n) ? n : null
}

function readGeoPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  })
}

export default function CaregiverVisitExecutionContent({ initial }: Props) {
  const router = useRouter()
  /** Clock in/out only — keeps Clock In/Out responsive. */
  const [clockPending, startClockTransition] = useTransition()
  const [backNavPending, startBackNavTransition] = useTransition()
  const [notesSavePending, setNotesSavePending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('tasks')
  const [clockModalOpen, setClockModalOpen] = useState(false)
  const [clockModalMode, setClockModalMode] = useState<'in' | 'out'>('in')
  const [tasks, setTasks] = useState(initial.tasks)
  const [notesDraft, setNotesDraft] = useState(initial.caregiverNotes ?? '')
  /** Last saved text (server or optimistic after save); used to disable Save when unchanged. */
  const [committedNotes, setCommittedNotes] = useState(initial.caregiverNotes ?? '')
  const [clockInAt, setClockInAt] = useState(initial.clockInAt)
  const [clockOutAt, setClockOutAt] = useState(initial.clockOutAt)
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel)
  const [visitTick, setVisitTick] = useState(0)

  useEffect(() => {
    setTasks(initial.tasks)
    // Preserve active local clock-in state if server refresh returns a stale payload.
    setClockInAt((prev) => (prev && !clockOutAt && !initial.clockInAt ? prev : initial.clockInAt))
    setClockOutAt((prev) => (prev && !initial.clockOutAt ? prev : initial.clockOutAt))
    setStatusLabel((prev) => (prev === 'In Progress' && initial.statusLabel !== 'Completed' ? prev : initial.statusLabel))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  useEffect(() => {
    const n = initial.caregiverNotes ?? ''
    setNotesDraft(n)
    setCommittedNotes(n)
  }, [initial.visitId])

  useEffect(() => {
    setCommittedNotes(initial.caregiverNotes ?? '')
  }, [initial.caregiverNotes])

  const notesDirty = notesDraft.trim() !== committedNotes.trim()

  const clockedIn = !!clockInAt && !clockOutAt

  useEffect(() => {
    if (!clockedIn || !clockInAt) return
    const id = window.setInterval(() => setVisitTick((x) => x + 1), 1000)
    return () => window.clearInterval(id)
  }, [clockedIn, clockInAt])

  const elapsedMsWhileVisiting = useMemo(() => {
    if (!clockInAt || clockOutAt) return 0
    void visitTick
    return Math.max(0, Date.now() - new Date(clockInAt).getTime())
  }, [clockInAt, clockOutAt, visitTick])

  const scheduledMin = useMemo(() => parseScheduledMinutes(initial.durationLabel), [initial.durationLabel])
  const elapsedMinutesFloor = Math.floor(elapsedMsWhileVisiting / 60000)
  const remainingScheduledMin =
    scheduledMin != null ? Math.max(0, scheduledMin - elapsedMinutesFloor) : null
  const overScheduledMin =
    scheduledMin != null && elapsedMinutesFloor > scheduledMin ? elapsedMinutesFloor - scheduledMin : null

  const clockInDisplay = useMemo(() => {
    if (!clockInAt) return null
    try {
      return new Date(clockInAt).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return null
    }
  }, [clockInAt])

  const visitDone = !!clockOutAt || initial.visitStatus.toLowerCase() === 'completed'

  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks])
  const totalCount = tasks.length

  const openClockInModal = () => {
    setError(null)
    setClockModalMode('in')
    setClockModalOpen(true)
  }

  const openClockOutModal = () => {
    setError(null)
    setClockModalMode('out')
    setClockModalOpen(true)
  }

  const runClockConfirm = () => {
    setError(null)
    startClockTransition(async () => {
      const geo = await readGeoPosition()
      const lat = geo?.lat ?? null
      const lng = geo?.lng ?? null

      if (clockModalMode === 'in') {
        const res = await caregiverClockInAction(initial.visitId, lat, lng)
        if (res.error) {
          setError(res.error)
          return
        }
        setClockInAt(new Date().toISOString())
        setStatusLabel('In Progress')
        setClockModalOpen(false)
        try {
          sessionStorage.setItem(MY_CARE_VISITS_TAB_STORAGE_KEY, 'in_progress')
        } catch {
          /* ignore */
        }
        // Do not refresh immediately here; local clock/timer is source of truth while visit is active.
        // A refresh can momentarily hydrate stale cached data and interrupt the live timer UX.
        return
      }

      const res = await caregiverClockOutAction(initial.visitId, lat, lng)
      if (res.error) {
        setError(res.error)
        return
      }
      setClockOutAt(new Date().toISOString())
      setStatusLabel('Completed')
      setClockModalOpen(false)
      router.refresh()
    })
  }

  const toggleTask = (taskId: string, next: boolean) => {
    if (!clockedIn || visitDone || !initial.canExecute) return
    // Urgent update: checkbox reflects click immediately (not inside startTransition).
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: next } : t)))
    void (async () => {
      const res = await caregiverSetTaskCompletedAction(initial.visitId, taskId, next)
      if (res.error) {
        setError(res.error)
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !next } : t)))
      }
      // Skip router.refresh() here — it refetches the whole page and feels slow; list view still revalidates via the server action.
    })()
  }

  const saveNotes = () => {
    setError(null)
    const trimmed = notesDraft.trim()
    setNotesSavePending(true)
    void (async () => {
      try {
        const res = await caregiverSaveVisitNotesAction(initial.visitId, notesDraft)
        if (res.error) {
          setError(res.error)
          return
        }
        setCommittedNotes(trimmed)
        setNotesDraft(trimmed)
        router.refresh()
      } finally {
        setNotesSavePending(false)
      }
    })()
  }

  const badgeClass =
    statusLabel === 'Completed'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : statusLabel === 'In Progress'
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : statusLabel === 'Missed'
          ? 'bg-orange-50 text-orange-800 border-orange-200'
          : 'bg-gray-100 text-gray-700 border-gray-200'

  return (
    <div className="relative mx-auto w-full space-y-6 mt-20">
      {backNavPending ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-10 w-10 shrink-0 animate-spin text-blue-600" aria-hidden />
          <p className="text-sm font-medium text-gray-800">Returning to My Care Visits…</p>
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <Modal
        isOpen={clockModalOpen}
        onClose={() => !clockPending && setClockModalOpen(false)}
        size="md"
        title={clockModalMode === 'in' ? 'Clock In to Visit' : 'Clock Out of Visit'}
        subtitle={
          clockModalMode === 'in'
            ? 'This will record your arrival time and location for EVV (Electronic Visit Verification).'
            : 'This will record your departure time and location and complete the visit.'
        }
      >
        <div className="space-y-4">
          {clockModalMode === 'in' ? (
            <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <Navigation className="h-5 w-5 shrink-0 text-sky-600 mt-0.5" aria-hidden />
              <div>
                <div className="font-semibold text-sky-800">Location Services</div>
                <p className="mt-1 text-sky-900/90">
                  Your GPS location will be recorded to verify you are at the client&apos;s address.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <Navigation className="h-5 w-5 shrink-0 text-sky-600 mt-0.5" aria-hidden />
              <div>
                <div className="font-semibold text-sky-800">Location Services</div>
                <p className="mt-1 text-sky-900/90">Your GPS location will be recorded for EVV at clock out.</p>
              </div>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setClockModalOpen(false)}
              disabled={clockPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={runClockConfirm}
              disabled={clockPending}
              icon={LogIn}
            >
              {clockModalMode === 'in' ? 'Confirm Clock In' : 'Confirm Clock Out'}
            </Button>
          </div>
        </div>
      </Modal>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <button
            type="button"
            disabled={backNavPending}
            onClick={() => {
              try {
                const backTab = clockInAt || initial.clockInAt ? 'in_progress' : 'upcoming'
                sessionStorage.setItem(MY_CARE_VISITS_TAB_STORAGE_KEY, backTab)
              } catch {
                /* ignore */
              }
              startBackNavTransition(() => {
                router.push('/pages/caregiver/my-care-visits')
              })
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 disabled:pointer-events-none disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{initial.clientName}</h1>
          <p className="text-sm text-gray-600">{initial.serviceName}</p>
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>{statusLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Signal className="h-5 w-5 text-emerald-600" aria-label="Connected" />
          {!visitDone && initial.canExecute ? (
            clockedIn ? (
              <Button
                variant="primary"
                type="button"
                onClick={openClockOutModal}
                disabled={clockPending}
                icon={LogIn}
              >
                Clock Out
              </Button>
            ) : (
              <Button
                variant="primary"
                type="button"
                onClick={openClockInModal}
                disabled={clockPending}
                icon={LogIn}
              >
                Clock In
              </Button>
            )
          ) : null}
        </div>
      </div>

      {clockedIn ? (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Timer className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-900/70">Time on visit</div>
                <div className="tabular-nums text-3xl font-bold tracking-tight text-gray-900">
                  {formatElapsedHms(elapsedMsWhileVisiting)}
                </div>
                {clockInDisplay ? (
                  <div className="mt-0.5 text-xs text-gray-600">Clock in recorded at {clockInDisplay}</div>
                ) : null}
              </div>
            </div>
            {scheduledMin != null ? (
              <div className="flex flex-wrap gap-6 border-t border-blue-200/80 pt-3 text-sm sm:border-t-0 sm:pt-0">
                <div>
                  <div className="text-xs font-medium text-gray-500">Scheduled length</div>
                  <div className="tabular-nums font-semibold text-gray-900">{scheduledMin} min</div>
                </div>
                {overScheduledMin != null && overScheduledMin > 0 ? (
                  <div>
                    <div className="text-xs font-medium text-amber-800">Over scheduled</div>
                    <div className="tabular-nums font-semibold text-amber-900">+{overScheduledMin} min</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-medium text-gray-500">Remaining (vs scheduled)</div>
                    <div className="tabular-nums font-semibold text-blue-900">{remainingScheduledMin ?? 0} min</div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-gray-400" aria-hidden />
            {initial.dateLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-gray-400" aria-hidden />
            {initial.timeLabel} {initial.durationLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-gray-400" aria-hidden />
            {initial.locationLine !== '-' ? initial.locationLine : initial.locationShort}
          </span>
        </div>
        <div className="text-sm font-medium text-gray-900">
          {completedCount}/{totalCount} tasks completed
        </div>
      </div>

      <Tabs
        variant="underline"
        items={[
          { key: 'tasks', label: `Tasks (${completedCount}/${totalCount})` },
          { key: 'notes', label: 'Notes' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      {tab === 'tasks' ? (
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">No tasks for this visit.</div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <label className="flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={!clockedIn || visitDone || !initial.canExecute}
                    onChange={(e) => toggleTask(task.id, e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900">{task.name}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {task.tags.map((tag) => (
                        <span
                          key={`${task.id}-tag-${tag}`}
                          className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200"
                        >
                          {tag}
                        </span>
                      ))}
                      {task.asNeeded ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200">
                          As Needed
                        </span>
                      ) : null}
                    </div>
                  </div>
                </label>
              </div>
            ))
          )}
          {!clockedIn && tasks.length > 0 ? (
            <p className="text-sm text-gray-500">Clock in to check off completed tasks.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="visit-notes" className="mb-2 block text-sm font-semibold text-gray-900">
              Visit Notes
            </label>
            <textarea
              id="visit-notes"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={8}
              disabled={!clockInAt}
              placeholder="Document your visit, any observations, or important information..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
            />
            {!clockInAt ? <p className="mt-2 text-sm text-gray-500">Clock in to add visit notes.</p> : null}
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              type="button"
              onClick={saveNotes}
              disabled={notesSavePending || !clockInAt || !notesDirty}
            >
              Save notes
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
