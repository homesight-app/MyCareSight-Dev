import sql from '@/db'
import type { ScheduleRow } from '@/lib/supabase/query/schedules'
import { patientFullName } from '@/lib/patient-name'
import {
  type CaregiverVisitStatus,
  type CaregiverVisitCardDTO,
  type CaregiverCareVisitsDTO,
  MY_CARE_VISITS_TAB_STORAGE_KEY,
  isVisitPastForCaregiverMyVisits,
} from '@/lib/caregiver-care-visits-shared'

type PatientRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  city?: string | null
  state?: string | null
  street_address?: string | null
}

type RequestRow = {
  id: string
  schedule_id: string
  status: 'pending' | 'approved' | 'declined'
  caregiver_note: string | null
}

type UnassignmentRequestRow = {
  id: string
  schedule_id: string
  status: 'pending' | 'approved' | 'declined'
}

function formatDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateLabelLong(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimeLabel(start: string | null, end: string | null): string {
  const s = (start ?? '').slice(0, 5)
  const e = (end ?? '').slice(0, 5)
  if (s && e) return `${s} - ${e}`
  return s || e || '-'
}

function formatTimeRangeAmPm(start: string | null, end: string | null): string {
  const toAmPm = (hm: string) => {
    const raw = (hm ?? '').slice(0, 5)
    if (!raw || !/^\d{2}:\d{2}$/.test(raw)) return ''
    const [h, m] = raw.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
    const d = new Date(2000, 0, 1, h, m, 0, 0)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const a = toAmPm(start ?? '')
  const b = toAmPm(end ?? '')
  if (a && b) return `${a} – ${b}`
  return a || b || '-'
}

function formatDurationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const base = new Date('2000-01-01T00:00:00')
  const [sh, sm] = start.slice(0, 5).split(':').map(Number)
  const [eh, em] = end.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return ''
  const a = new Date(base)
  const b = new Date(base)
  a.setHours(sh, sm, 0, 0)
  b.setHours(eh, em, 0, 0)
  const diffMin = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
  if (!diffMin) return ''
  return `(${diffMin} min)`
}

function extractTaskToken(raw: string): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  const parts = v.split('::')
  return (parts.length > 1 ? parts[1] : parts[0]).trim()
}

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function decodeAdlCodes(codes: string[] | null | undefined, taskNameById?: Map<string, string>): string[] {
  if (!Array.isArray(codes)) return []
  return codes
    .map((code) => {
      const v = String(code ?? '').trim()
      if (!v) return ''
      const parts = v.split('::')
      const token = (parts.length > 1 ? parts[1] : parts[0]).trim()
      if (!token) return ''
      const mapped = taskNameById?.get(token)
      return (mapped && mapped.trim()) || token
    })
    .filter(Boolean)
}

async function buildTaskNameByIdForSchedules(schedules: ScheduleRow[]): Promise<Map<string, string>> {
  const taskNameById = new Map<string, string>()
  const taskIdTokens = Array.from(
    new Set(
      schedules
        .flatMap((s) => s.adl_codes ?? [])
        .map((raw) => extractTaskToken(raw))
        .filter((token) => token && isUuidLike(token))
    )
  )
  if (taskIdTokens.length === 0) return taskNameById

  try {
    const rows = await sql<{ id: string; name: string | null; code: string | null }[]>`
      SELECT id, name, code FROM task_catalog WHERE id = ANY(${taskIdTokens}::uuid[])
    `
    for (const row of rows) {
      const id = (row.id ?? '').trim()
      if (!id) continue
      const label = (row.name ?? '').trim() || (row.code ?? '').trim()
      if (label) taskNameById.set(id, label)
    }
  } catch {
    // Non-fatal: task names fall back to raw tokens
  }
  return taskNameById
}

function getStatus(row: ScheduleRow): CaregiverVisitStatus {
  const status = String(row.status ?? '').toLowerCase().trim()
  if (status === 'completed') return 'completed'
  if (status === 'missed') return 'missed'
  if (status === 'in_progress' || status === 'in progress') return 'in_progress'
  if (status === 'unassigned') return 'open'
  if (status === 'scheduled') return 'assigned'
  return row.caregiver_id ? 'assigned' : 'open'
}

function isTodayDate(date: string): boolean {
  const today = new Date()
  const d = new Date(`${date}T00:00:00`)
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

export async function fetchCaregiverCareVisitsData(
  caregiverMemberId: string,
  caregiverAgencyId: string | null,
  allRows: ScheduleRow[]
): Promise<CaregiverCareVisitsDTO> {
  if (!caregiverAgencyId || !allRows.length) {
    return { visits: [], mineCount: 0, openCount: 0, todayCount: 0 }
  }

  const candidateRows = allRows
  const patientIds = Array.from(new Set(candidateRows.map((v) => v.patient_id)))
  const scheduleIds = candidateRows.map((v) => v.id)

  const taskNameById = await buildTaskNameByIdForSchedules(candidateRows)

  type TaskAggRow = { scheduled_visit_id: string; completed_at: string | null }
  type VteRow = {
    scheduled_visit_id: string
    caregiver_notes: string | null
    clock_in_time: string | null
    clock_out_time: string | null
  }

  const [patientsRows, requestRows, unassignReqRows, taskAggRows, vteRows] = await Promise.all([
    patientIds.length
      ? sql<PatientRow[]>`
          SELECT id, first_name, last_name, city, state, street_address
          FROM patients WHERE id = ANY(${patientIds}::uuid[])
        `
      : Promise.resolve([] as PatientRow[]),
    scheduleIds.length
      ? sql<RequestRow[]>`
          SELECT id, schedule_id, status, caregiver_note
          FROM schedule_assignment_requests
          WHERE caregiver_member_id = ${caregiverMemberId}
            AND schedule_id = ANY(${scheduleIds}::uuid[])
        `
      : Promise.resolve([] as RequestRow[]),
    scheduleIds.length
      ? sql<UnassignmentRequestRow[]>`
          SELECT id, schedule_id, status
          FROM schedule_unassignment_requests
          WHERE caregiver_member_id = ${caregiverMemberId}
            AND status = 'pending'
            AND schedule_id = ANY(${scheduleIds}::uuid[])
        `
      : Promise.resolve([] as UnassignmentRequestRow[]),
    scheduleIds.length
      ? sql<TaskAggRow[]>`
          SELECT scheduled_visit_id, completed_at
          FROM scheduled_visit_tasks
          WHERE scheduled_visit_id = ANY(${scheduleIds}::uuid[])
        `
      : Promise.resolve([] as TaskAggRow[]),
    scheduleIds.length
      ? sql<VteRow[]>`
          SELECT scheduled_visit_id, caregiver_notes, clock_in_time, clock_out_time
          FROM visit_time_entries
          WHERE scheduled_visit_id = ANY(${scheduleIds}::uuid[])
        `
      : Promise.resolve([] as VteRow[]),
  ])

  const patientById = new Map(patientsRows.map((p) => [p.id, p]))
  const pendingRequestBySchedule = new Map<string, { id: string; note: string | null }>()
  const pendingUnassignmentBySchedule = new Map<string, string>()
  for (const r of requestRows) {
    if (r.status === 'pending') {
      pendingRequestBySchedule.set(r.schedule_id, {
        id: r.id,
        note: r.caregiver_note?.trim() ? r.caregiver_note.trim() : null,
      })
    }
  }
  for (const r of unassignReqRows) {
    if (r.status === 'pending') pendingUnassignmentBySchedule.set(r.schedule_id, r.id)
  }

  const taskCountByVisit = new Map<string, { completed: number; total: number }>()
  for (const tr of taskAggRows) {
    const vid = String(tr.scheduled_visit_id ?? '')
    if (!vid) continue
    const cur = taskCountByVisit.get(vid) ?? { completed: 0, total: 0 }
    cur.total += 1
    if (tr.completed_at) cur.completed += 1
    taskCountByVisit.set(vid, cur)
  }

  const activeClockInVisitIds = new Set<string>()
  const clockedOutVisitIds = new Set<string>()
  const caregiverNotesByVisit = new Map<string, string | null>()
  for (const vr of vteRows) {
    const vid = String(vr.scheduled_visit_id ?? '')
    if (!vid) continue
    if (vr.clock_in_time && !vr.clock_out_time) activeClockInVisitIds.add(vid)
    if (vr.clock_out_time) clockedOutVisitIds.add(vid)
    const n = vr.caregiver_notes?.trim() ? vr.caregiver_notes.trim() : null
    caregiverNotesByVisit.set(vid, n)
  }

  const visits = candidateRows
    .map((row) => {
      const patient = patientById.get(row.patient_id)
      const locationShort = [patient?.city?.trim(), patient?.state?.trim()].filter(Boolean).join(', ') || '-'
      const pending = pendingRequestBySchedule.get(row.id)
      const adlTasks = decodeAdlCodes(row.adl_codes, taskNameById)
      const fromDb = taskCountByVisit.get(row.id)
      const adlTasksTotal = fromDb && fromDb.total > 0 ? fromDb.total : adlTasks.length
      const adlTasksCompleted = fromDb && fromDb.total > 0 ? fromDb.completed : 0
      const schedNotes = row.notes?.trim() ? row.notes.trim() : null
      const cgNotes = caregiverNotesByVisit.get(row.id) ?? null
      const hasVisitNote = !!(cgNotes || schedNotes)
      return {
        id: row.id,
        date: row.date,
        dateLabel: formatDateLabel(row.date),
        dateLabelLong: formatDateLabelLong(row.date),
        timeLabel: formatTimeLabel(row.start_time, row.end_time),
        timeRangeDisplay: formatTimeRangeAmPm(row.start_time, row.end_time),
        durationLabel: formatDurationLabel(row.start_time, row.end_time),
        clientName: patient ? patientFullName(patient as { first_name: string; last_name: string }) : 'Client',
        serviceName: (row.type ?? '').trim() || 'Personal Care',
        locationLine: patient?.street_address?.trim() || '-',
        locationShort,
        status: activeClockInVisitIds.has(row.id) ? 'in_progress' : getStatus(row),
        adlTasks,
        adlTasksCompleted,
        adlTasksTotal,
        hasVisitNote,
        notes: row.notes,
        isMine: row.caregiver_id === caregiverMemberId,
        hasMyPendingRequest: !!pending,
        hasPendingUnassignmentRequest: pendingUnassignmentBySchedule.has(row.id),
        myPendingUnassignmentRequestId: pendingUnassignmentBySchedule.get(row.id) ?? null,
        myPendingRequestId: pending?.id ?? null,
        myRequestNote: pending?.note ?? null,
        hasClockOut: clockedOutVisitIds.has(row.id),
      } satisfies CaregiverVisitCardDTO
    })
    .sort((a, b) => `${a.date} ${a.timeLabel}`.localeCompare(`${b.date} ${b.timeLabel}`))

  const mineCount = visits.filter((v) => v.isMine && !isVisitPastForCaregiverMyVisits(v)).length
  const openCount = visits.filter((v) => v.status === 'open' && !isVisitPastForCaregiverMyVisits(v)).length
  const todayCount = visits.filter(
    (v) => isTodayDate(v.date) && !isVisitPastForCaregiverMyVisits(v)
  ).length
  return { visits, mineCount, openCount, todayCount }
}
