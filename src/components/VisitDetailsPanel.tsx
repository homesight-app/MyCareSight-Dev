'use client'

import { useState } from 'react'
import { CalendarDays, Clock3, MapPin, UserRound } from 'lucide-react'
import Tabs from '@/components/ui/Tabs'
import InternalNotesPanel from '@/components/InternalNotesPanel'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'
import type { VisitCorrectionHistoryItem } from '@/lib/repositories/visit-corrections'
import type { VisitStatus } from '@/lib/visit-status'
import { formatVisitTimeRangeLabel } from '@/lib/visit-time-display'

export type VisitDetailsActions = {
  onAssign?: () => void
  onAdvertise?: () => void
  onUnassign?: () => void
  onMiss?: () => void
  onHold?: () => void
  onCancel?: () => void
  onReinstate?: () => void
  onCorrect?: () => void
}

type Props = {
  visit: AllVisitCardDTO
  canManageNotes?: boolean
  agencyId?: string
  canSeeHistory?: boolean
  correctionHistory?: VisitCorrectionHistoryItem[]
  correctionHistoryLoading?: boolean
}

function statusPresentation(status: VisitStatus) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-800 before:bg-emerald-600'
  if (status === 'missed') return 'bg-rose-50 text-rose-800 before:bg-rose-500'
  if (status === 'on_hold') return 'bg-amber-50 text-amber-800 before:bg-amber-500'
  if (status === 'in_progress') return 'bg-blue-50 text-blue-800 before:bg-blue-600'
  return 'bg-slate-100 text-slate-700 before:bg-slate-500'
}

function displayStatus(visit: AllVisitCardDTO) {
  return visit.status === 'unassigned' ? 'Scheduled' : visit.statusLabel
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

export default function VisitDetailsPanel({
  visit, canManageNotes, agencyId, canSeeHistory,
  correctionHistory = [], correctionHistoryLoading = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'notes' | 'history'>('overview')
  const taskLabel = visit.adlTasks.join(', ') || 'No care tasks listed'
  const statusClass = statusPresentation(visit.status)
  const status = <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium before:h-1.5 before:w-1.5 before:rounded-full ${statusClass}`}>{displayStatus(visit)}</span>

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">{status}{visit.correctionCount > 0 ? <span className="text-xs text-amber-800">Corrected</span> : null}</div>
        <div>
          <h3 className="text-lg font-semibold leading-tight text-gray-950">{visit.clientName}</h3>
          <p className="mt-0.5 text-sm text-gray-600">{taskLabel}</p>
        </div>
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{visit.locationLabel}</div>
          <div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />{displayDate(visit.date)}</div>
          <div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />{formatVisitTimeRangeLabel(visit.timeLabel)}</div>
          <div className={`flex items-center gap-2 ${visit.caregiverName ? '' : 'text-amber-700'}`}><UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />{visit.caregiverName ?? 'Unassigned'}</div>
        </div>
      </div>

      <Tabs variant="underline" active={activeTab} onChange={key => setActiveTab(key as typeof activeTab)}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'tasks', label: 'Tasks' },
          ...(canManageNotes && agencyId ? [{ key: 'notes', label: 'Notes' }] : []),
          ...(canSeeHistory ? [{ key: 'history', label: 'History' }] : []),
        ]} />

      {activeTab === 'overview' ? <div role="tabpanel" aria-label="Overview" className="space-y-4">
        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 px-3 text-xs">
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2"><dt className="text-gray-500">Status</dt><dd>{status}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2"><dt className="text-gray-500">Caregiver</dt><dd className={visit.caregiverName ? 'text-gray-900' : 'text-amber-700'}>{visit.caregiverName ?? 'Unassigned'}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2"><dt className="text-gray-500">Client</dt><dd className="font-medium text-gray-900">{visit.clientName}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2 py-2"><dt className="text-gray-500">Care task</dt><dd className="text-gray-900">{taskLabel}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2"><dt className="text-gray-500">Date</dt><dd className="text-gray-900">{displayDate(visit.date)}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2"><dt className="text-gray-500">Time</dt><dd className="text-gray-900">{formatVisitTimeRangeLabel(visit.timeLabel)}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2 py-2"><dt className="text-gray-500">Location</dt><dd className="text-gray-900">{visit.locationLabel}</dd></div>
        </dl>
      </div> : null}

      {activeTab === 'tasks' ? <div role="tabpanel" aria-label="Tasks">
        {visit.adlTasks.length ? <ul className="space-y-2">{visit.adlTasks.map((task, index) => <li key={`${index}:${task}`} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800">{task}</li>)}</ul>
          : <p className="text-sm text-gray-500">No care tasks listed.</p>}
      </div> : null}

      {activeTab === 'notes' && canManageNotes && agencyId ? <div role="tabpanel" aria-label="Notes" className="space-y-3">
        {visit.notes ? <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-700"><h4 className="mb-1 text-xs font-semibold text-gray-600">Visit notes</h4><p className="whitespace-pre-wrap">{visit.notes}</p></div> : null}
        <InternalNotesPanel subjectType="visit" subjectId={visit.id} agencyId={agencyId} canManage={canManageNotes} deferTagOptions />
      </div> : null}

      {activeTab === 'history' && canSeeHistory ? <div role="tabpanel" aria-label="History" className="space-y-3">
        {correctionHistoryLoading ? <p className="text-sm text-gray-500">Loading history...</p>
          : correctionHistory.length === 0 ? <p className="text-sm text-gray-500">No corrections recorded.</p>
            : <ol className="space-y-3">{correctionHistory.map(item => <li key={item.id} className="rounded-lg border border-gray-200 p-3 text-sm">
              <div className="font-medium text-gray-900">{item.previousStatus} → {item.correctedStatus}</div>
              <div className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()} · Changed by user {item.correctedByUserId}</div>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">{item.reason}</p>
              {item.actualStartTime && item.actualEndTime ? <p className="mt-1 text-xs text-gray-600">Manually verified: {new Date(item.actualStartTime).toLocaleString()} – {new Date(item.actualEndTime).toLocaleString()}</p> : null}
            </li>)}</ol>}
      </div> : null}
    </div>
  )
}
