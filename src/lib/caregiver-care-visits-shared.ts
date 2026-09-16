/** Client-safe types, constants, and pure helpers for caregiver care visits. */

export type CaregiverVisitStatus = 'open' | 'assigned' | 'completed' | 'missed' | 'in_progress'

export type CaregiverVisitCardDTO = {
  id: string
  date: string
  dateLabel: string
  dateLabelLong: string
  timeLabel: string
  timeRangeDisplay: string
  durationLabel: string
  clientName: string
  serviceName: string
  locationLine: string
  locationShort: string
  status: CaregiverVisitStatus
  adlTasks: string[]
  adlTasksCompleted: number
  adlTasksTotal: number
  hasVisitNote: boolean
  notes: string | null
  isMine: boolean
  hasMyPendingRequest: boolean
  hasPendingUnassignmentRequest: boolean
  myPendingUnassignmentRequestId: string | null
  myPendingRequestId: string | null
  myRequestNote: string | null
  hasClockOut: boolean
}

export type CaregiverCareVisitsDTO = {
  visits: CaregiverVisitCardDTO[]
  mineCount: number
  openCount: number
  todayCount: number
}

/** Persist My Visits sub-tab (`upcoming` | `in_progress` | `past`) across client navigations. */
export const MY_CARE_VISITS_TAB_STORAGE_KEY = 'caregiver-mycarevisits-tab'

function isPastDate(date: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${date}T00:00:00`)
  return d < today
}

/** Past tab / "no longer upcoming": day before today, or visit already ended (clock-out / missed). */
export function isVisitPastForCaregiverMyVisits(v: {
  date: string
  status: CaregiverVisitStatus
  hasClockOut?: boolean
}): boolean {
  if (v.hasClockOut) return true
  if (v.status === 'completed' || v.status === 'missed') return true
  return isPastDate(v.date)
}
