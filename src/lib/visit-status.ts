/** Canonical scheduled-visit lifecycle values shared by manager and caregiver views. */
export const VISIT_STATUS_VALUES = [
  'completed',
  'missed',
  'cancelled',
  'voided',
  'on_hold',
  'in_progress',
  'scheduled',
  'unassigned',
] as const

export type VisitStatus = (typeof VISIT_STATUS_VALUES)[number]

export function visitStatusFromScheduleRow(row: {
  status?: string | null
  caregiver_id?: string | null
}): VisitStatus {
  const raw = String(row.status ?? '').toLowerCase().trim().replaceAll(' ', '_')
  if ((VISIT_STATUS_VALUES as readonly string[]).includes(raw)) return raw as VisitStatus
  return row.caregiver_id ? 'scheduled' : 'unassigned'
}

/** Calendar fallback for a future visit that was prematurely marked missed by a clock-based sync. */
export function visitStatusForScheduleCalendar(
  row: {
    status?: string | null
    status_reason?: string | null
    caregiver_id?: string | null
    date?: string | null
    start_time?: string | null
    end_time?: string | null
    end_date?: string | null
  },
  now: Date
): VisitStatus {
  const base = visitStatusFromScheduleRow(row)
  if (base === 'completed' || base === 'in_progress' || base === 'cancelled' || base === 'voided' || base === 'on_hold') return base

  const date = String(row.date ?? '').trim()
  const start = String(row.start_time ?? '').trim().slice(0, 5)
  const end = String(row.end_time ?? row.start_time ?? '').trim().slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(end)) return base

  const endAt = new Date(`${date}T${end}:00`)
  if (row.end_date && row.end_date > date) {
    endAt.setDate(endAt.getDate() + Math.round((Date.parse(`${row.end_date}T00:00:00`) - Date.parse(`${date}T00:00:00`)) / 86_400_000))
  } else if (/^\d{2}:\d{2}$/.test(start) && end < start) {
    endAt.setDate(endAt.getDate() + 1)
  }
  if (Number.isNaN(endAt.getTime())) return base

  if (base === 'missed') {
    // A reason signals a deliberate status decision. Do not override it.
    if (row.status_reason?.trim()) return base
    return now.getTime() < endAt.getTime() ? (row.caregiver_id ? 'scheduled' : 'unassigned') : base
  }
  return now.getTime() > endAt.getTime() ? 'missed' : base
}

export function visitStatusLabel(status: VisitStatus): string {
  if (status === 'in_progress') return 'In Progress'
  if (status === 'on_hold') return 'On Hold'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function canCaregiverStartVisit(status: VisitStatus): boolean {
  return status === 'scheduled' || status === 'in_progress'
}

export function canCaregiverEditVisitExecution(status: VisitStatus): boolean {
  return status === 'in_progress'
}

export function isVisitTerminal(status: VisitStatus): boolean {
  return status === 'completed' || status === 'missed' || status === 'cancelled' || status === 'voided'
}
