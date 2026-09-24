import zipcodes from 'zipcodes'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import { managerGetSchedulesByIds } from '@/lib/repositories/manager-scheduling'
import type { ScheduleRow } from '@/lib/supabase/query/schedules'
import type {
  ScheduleAssignmentRequestRow,
  ScheduleUnassignmentRequestRow,
} from '@/lib/supabase/query/schedule-assignment-requests'
import { overallScorePercent, proximityPercentFromMiles } from '@/lib/visit-assignment-scoring'
import { patientFullName } from '@/lib/patient-name'

export type AssignmentRequestCardDTO = {
  id: string
  caregiverName: string
  caregiverTitle: string
  skillMatchPercent: number
  distanceMiles: number
  cityLabel: string
  matchedSkills: string[]
  note: string
  requestedAtLabel: string
  proximityPercent: number
  overallPercent: number
}

export type AssignmentVisitCardDTO = {
  id: string
  visitTitle: string
  clientName: string
  dateLabel: string
  timeLabel: string
  locationLabel: string
  requests: AssignmentRequestCardDTO[]
}

export type UnassignmentRequestListItemDTO = {
  requestId: string
  visitId: string
  visitTitle: string
  clientName: string
  dateLabel: string
  timeLabel: string
  locationLabel: string
  caregiverName: string
  caregiverTitle: string
  requestedAtLabel: string
}

export type ResolvedAssignmentRowDTO = {
  id: string
  requestType: 'assignment' | 'unassignment'
  kind: 'approved' | 'declined'
  caregiverName: string
  visitTitle: string
  clientName: string
  visitDateLabel: string
  resolvedAtLabel: string
  reason?: string
}

function normalizeUsZipForLookup(zip: unknown): string | null {
  if (zip === null || zip === undefined) return null
  const s = String(zip).trim()
  if (!s) return null
  const digits = s.replace(/\D/g, '').slice(0, 5)
  return digits.length === 5 ? digits : null
}

function formatScheduleDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimePart(t: string | null | undefined): string {
  if (!t) return ''
  return String(t).slice(0, 5)
}

function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = formatTimePart(start)
  const b = formatTimePart(end)
  if (a && b) return `${a}–${b}`
  return a || b || '—'
}

function patientLocationLabel(patient: {
  zip_code?: string | null
  state?: string | null
  city?: string | null
  street_address?: string | null
}): string {
  const z = normalizeUsZipForLookup(patient.zip_code)
  if (z) {
    const loc = zipcodes.lookup(z)
    if (loc?.city && loc?.state) return `${loc.city}, ${loc.state}`
  }
  if (patient.city && patient.state) return `${patient.city}, ${patient.state}`
  if (patient.state) return String(patient.state)
  if (patient.street_address) return String(patient.street_address).split(',')[0]?.trim() || '—'
  return '—'
}

function staffCityLabel(zip: unknown): string {
  const z = normalizeUsZipForLookup(zip)
  if (!z) return '—'
  const loc = zipcodes.lookup(z)
  if (loc?.city && loc?.state) return `${loc.city}, ${loc.state}`
  return z
}

function visitTitleFromSchedule(s: ScheduleRow, taskNameById?: Map<string, string>): string {
  const tasks = decodeAdlCodes(s.adl_codes, taskNameById)
  if (tasks.length > 0) return tasks.join(', ')
  const t = (s.type ?? '').trim()
  if (t) return t
  const d = (s.description ?? '').trim()
  if (d) return d.length > 80 ? `${d.slice(0, 77)}…` : d
  return 'Care visit'
}

function decodeAdlCodes(codes: string[] | null | undefined, taskNameById?: Map<string, string>): string[] {
  if (!Array.isArray(codes)) return []
  return codes
    .map((code) => {
      const v = String(code || '').trim()
      if (!v) return ''
      const parts = v.split('::')
      const token = (parts.length > 1 ? parts[1] : parts[0]).trim()
      if (!token) return ''
      const mapped = taskNameById?.get(token)
      return (mapped && mapped.trim()) || token
    })
    .filter(Boolean)
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

function sanitizeUuidList(ids: unknown[]): string[] {
  return Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x !== 'null')))
}

function skillMatchForStaff(
  requiredSkills: string[],
  caregiverSkills: string[]
): { percent: number; matched: string[] } {
  const requiredLen = requiredSkills.length
  if (requiredLen === 0) return { percent: 100, matched: [] }
  const matched = requiredSkills.filter((sk) => caregiverSkills.includes(sk))
  return { percent: Math.round((matched.length / requiredLen) * 100), matched }
}

function formatRequestedAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatResolvedAt(iso: string): string {
  return formatRequestedAt(iso)
}

type PatientRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  zip_code?: string | null
  state?: string | null
  city?: string | null
  street_address?: string | null
}

type StaffRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  zip_code?: string | null
  skills?: string[] | null
  role?: string | null
  job_title?: string | null
}

export async function fetchVisitAssignmentDashboardData(agencyId: string | null): Promise<{
  visits: AssignmentVisitCardDTO[]
  unassignmentItems: UnassignmentRequestListItemDTO[]
  resolved: ResolvedAssignmentRowDTO[]
  assignmentApprovedTotal: number
  assignmentDeclinedTotal: number
  unassignmentApprovedTotal: number
  unassignmentDeclinedTotal: number
  error?: string
}> {
  const empty = {
    visits: [] as AssignmentVisitCardDTO[],
    unassignmentItems: [] as UnassignmentRequestListItemDTO[],
    resolved: [] as ResolvedAssignmentRowDTO[],
    assignmentApprovedTotal: 0,
    assignmentDeclinedTotal: 0,
    unassignmentApprovedTotal: 0,
    unassignmentDeclinedTotal: 0,
  }

  if (!agencyId) return empty

  const [
    pendingRes,
    resolvedRes,
    pendingUnassignRes,
    resolvedUnassignRes,
    assignApproved,
    assignDeclined,
    unassignApproved,
    unassignDeclined,
  ] = await Promise.all([
    q.getPendingScheduleAssignmentRequests(agencyId),
    q.getRecentResolvedScheduleAssignmentRequests(40, agencyId),
    q.getPendingScheduleUnassignmentRequests(agencyId),
    q.getRecentResolvedScheduleUnassignmentRequests(40, agencyId),
    sql<[{ count: string }]>`
      SELECT COUNT(*) AS count
      FROM schedule_assignment_requests sar
      WHERE sar.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = sar.schedule_id
            AND sv.agency_id = ${agencyId}
        )
    `,
    sql<[{ count: string }]>`
      SELECT COUNT(*) AS count
      FROM schedule_assignment_requests sar
      WHERE sar.status = 'declined'
        AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = sar.schedule_id
            AND sv.agency_id = ${agencyId}
        )
    `,
    sql<[{ count: string }]>`
      SELECT COUNT(*) AS count
      FROM schedule_unassignment_requests sur
      WHERE sur.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = sur.schedule_id
            AND sv.agency_id = ${agencyId}
        )
    `,
    sql<[{ count: string }]>`
      SELECT COUNT(*) AS count
      FROM schedule_unassignment_requests sur
      WHERE sur.status = 'declined'
        AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = sur.schedule_id
            AND sv.agency_id = ${agencyId}
        )
    `,
  ])

  if (pendingRes.error) return { ...empty, error: pendingRes.error.message }
  if (resolvedRes.error) return { ...empty, error: resolvedRes.error.message }
  if (pendingUnassignRes.error) return { ...empty, error: pendingUnassignRes.error.message }
  if (resolvedUnassignRes.error) return { ...empty, error: resolvedUnassignRes.error.message }

  const assignmentApprovedTotal = Number(assignApproved[0]?.count ?? 0)
  const assignmentDeclinedTotal = Number(assignDeclined[0]?.count ?? 0)
  const unassignmentApprovedTotal = Number(unassignApproved[0]?.count ?? 0)
  const unassignmentDeclinedTotal = Number(unassignDeclined[0]?.count ?? 0)

  const pendingRows = (pendingRes.data ?? []) as ScheduleAssignmentRequestRow[]
  const resolvedRows = (resolvedRes.data ?? []) as ScheduleAssignmentRequestRow[]
  const unassignRows = (pendingUnassignRes.data ?? []) as ScheduleUnassignmentRequestRow[]
  const resolvedUnassignRows = (resolvedUnassignRes.data ?? []) as ScheduleUnassignmentRequestRow[]

  const scheduleIds = sanitizeUuidList(pendingRows.map((r) => r.schedule_id))
  const resolvedScheduleIds = sanitizeUuidList(resolvedRows.map((r) => r.schedule_id))
  const unassignScheduleIds = sanitizeUuidList(unassignRows.map((r) => r.schedule_id))
  const resolvedUnassignScheduleIds = sanitizeUuidList(resolvedUnassignRows.map((r) => r.schedule_id))

  if (
    scheduleIds.length === 0 &&
    resolvedScheduleIds.length === 0 &&
    unassignScheduleIds.length === 0 &&
    resolvedUnassignScheduleIds.length === 0
  ) {
    return {
      visits: [],
      unassignmentItems: [],
      resolved: [],
      assignmentApprovedTotal,
      assignmentDeclinedTotal,
      unassignmentApprovedTotal,
      unassignmentDeclinedTotal,
    }
  }

  const allScheduleIds = sanitizeUuidList(
    scheduleIds.concat(resolvedScheduleIds).concat(unassignScheduleIds).concat(resolvedUnassignScheduleIds)
  )

  const { data: schedulesData, error: schedErr } = await managerGetSchedulesByIds(allScheduleIds)

  if (schedErr) {
    return {
      visits: [],
      unassignmentItems: [],
      resolved: [],
      assignmentApprovedTotal,
      assignmentDeclinedTotal,
      unassignmentApprovedTotal,
      unassignmentDeclinedTotal,
      error: schedErr.message,
    }
  }

  const schedules = (schedulesData ?? []) as ScheduleRow[]
  const scheduleById = new Map(schedules.map((s) => [s.id, s]))

  const taskIdTokens = Array.from(
    new Set(
      schedules
        .flatMap((s) => s.adl_codes ?? [])
        .map((raw) => extractTaskToken(raw))
        .filter((token) => token && isUuidLike(token))
    )
  )
  const taskNameById = new Map<string, string>()
  if (taskIdTokens.length > 0) {
    try {
      const taskRows = await sql<{ id: string; name: string | null; code: string | null }[]>`
        SELECT id, name, code FROM task_catalog WHERE id = ANY(${taskIdTokens}::uuid[])
      `
      for (const row of taskRows) {
        const id = (row.id ?? '').trim()
        if (!id) continue
        const label = (row.name ?? '').trim() || (row.code ?? '').trim()
        if (label) taskNameById.set(id, label)
      }
    } catch {
      // Non-fatal: task names fall back to raw tokens
    }
  }

  const patientIds = sanitizeUuidList(schedules.map((s) => s.patient_id))
  const staffIds = new Set<string>()
  for (const r of pendingRows) {
    if (r.caregiver_member_id) staffIds.add(r.caregiver_member_id)
  }
  for (const r of resolvedRows) {
    if (r.caregiver_member_id) staffIds.add(r.caregiver_member_id)
  }
  for (const r of unassignRows) {
    if (r.caregiver_member_id) staffIds.add(r.caregiver_member_id)
  }
  for (const r of resolvedUnassignRows) {
    if (r.caregiver_member_id) staffIds.add(r.caregiver_member_id)
  }
  const staffIdList = sanitizeUuidList(Array.from(staffIds))

  const [patientsData, staffData] = await Promise.all([
    patientIds.length === 0
      ? Promise.resolve([] as PatientRow[])
      : sql<PatientRow[]>`
          SELECT id, first_name, last_name, zip_code, state, city, street_address
          FROM patients WHERE id = ANY(${patientIds}::uuid[])
        `,
    staffIdList.length === 0
      ? Promise.resolve([] as StaffRow[])
      : sql<StaffRow[]>`
          SELECT id, first_name, last_name, zip_code, skills, role, job_title
          FROM caregiver_members WHERE id = ANY(${staffIdList}::uuid[])
        `,
  ])

  const patientById = new Map(patientsData.map((p) => [p.id, p]))
  const staffById = new Map(staffData.map((s) => [s.id, s]))

  const { data: reqRows } = await q.getCaregiverRequirementsByPatientIds(patientIds)
  const requirementsByPatient = new Map<string, string[]>()
  for (const row of reqRows ?? []) {
    const pr = row as { patient_id?: string; skill_codes?: string[] }
    if (pr.patient_id && Array.isArray(pr.skill_codes)) {
      requirementsByPatient.set(pr.patient_id, pr.skill_codes)
    }
  }

  type PendingAgg = { scheduleId: string; requests: AssignmentRequestCardDTO[] }
  const bySchedule = new Map<string, PendingAgg>()

  for (const row of pendingRows) {
    const sched = scheduleById.get(row.schedule_id)
    if (!sched || sched.caregiver_id) continue

    const patient = patientById.get(sched.patient_id)
    const staff = staffById.get(row.caregiver_member_id)
    if (!patient || !staff) continue

    const visitAddrZip = sched.patient_address?.zip_code ?? null
    const clientZip = normalizeUsZipForLookup(visitAddrZip ?? patient.zip_code)
    const staffZip = normalizeUsZipForLookup(staff.zip_code)
    let distanceMiles = Number.POSITIVE_INFINITY
    if (clientZip && staffZip) {
      const d = zipcodes.distance(clientZip, staffZip)
      if (d != null && Number.isFinite(d)) distanceMiles = d
    }

    const proximity = proximityPercentFromMiles(distanceMiles) ?? 0

    const caregiverSkills = Array.isArray(staff.skills) ? staff.skills : []
    const required = requirementsByPatient.get(patient.id) ?? []
    const { percent: skillPct, matched } = skillMatchForStaff(required, caregiverSkills)

    const caregiverName = [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'Caregiver'
    const caregiverTitle =
      (staff.job_title && staff.job_title.trim()) || (staff.role && String(staff.role).trim()) || 'Caregiver'

    const card: AssignmentRequestCardDTO = {
      id: row.id,
      caregiverName,
      caregiverTitle,
      skillMatchPercent: skillPct,
      distanceMiles,
      cityLabel: staffCityLabel(staff.zip_code),
      matchedSkills: matched,
      note: (row.caregiver_note ?? '').trim(),
      requestedAtLabel: formatRequestedAt(row.created_at),
      proximityPercent: proximity,
      overallPercent: overallScorePercent(skillPct, proximity),
    }

    const existing = bySchedule.get(sched.id)
    if (existing) {
      existing.requests.push(card)
    } else {
      bySchedule.set(sched.id, { scheduleId: sched.id, requests: [card] })
    }
  }

  const visits: AssignmentVisitCardDTO[] = []
  for (const agg of Array.from(bySchedule.values())) {
    const sched = scheduleById.get(agg.scheduleId)
    const patient = sched ? patientById.get(sched.patient_id) : undefined
    if (!sched || !patient) continue

    const sortedReqs = [...agg.requests].sort((a, b) => b.overallPercent - a.overallPercent)
    if (sortedReqs.length === 0) continue

    visits.push({
      id: sched.id,
      visitTitle: visitTitleFromSchedule(sched, taskNameById),
      clientName: patientFullName(patient as { first_name: string; last_name: string }),
      dateLabel: formatScheduleDate(sched.date),
      timeLabel: formatTimeRange(sched.start_time, sched.end_time),
      locationLabel: patientLocationLabel(patient),
      requests: sortedReqs,
    })
  }

  visits.sort((a, b) => {
    const sa = scheduleById.get(a.id)
    const sb = scheduleById.get(b.id)
    if (!sa || !sb) return 0
    return sa.date.localeCompare(sb.date) || formatTimePart(sa.start_time).localeCompare(formatTimePart(sb.start_time))
  })

  const unassignmentItems: UnassignmentRequestListItemDTO[] = []
  for (const row of unassignRows) {
    const sched = scheduleById.get(row.schedule_id)
    const patient = sched ? patientById.get(sched.patient_id) : undefined
    const staff = staffById.get(row.caregiver_member_id)
    if (!sched || !patient || !staff) continue
    const assignedId = sched.caregiver_id?.trim() || null
    if (!assignedId || assignedId !== row.caregiver_member_id) continue

    const caregiverName = [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'Caregiver'
    const caregiverTitle =
      (staff.job_title && staff.job_title.trim()) || (staff.role && String(staff.role).trim()) || 'Caregiver'

    unassignmentItems.push({
      requestId: row.id,
      visitId: sched.id,
      visitTitle: visitTitleFromSchedule(sched, taskNameById),
      clientName: patientFullName(patient as { first_name: string; last_name: string }),
      dateLabel: formatScheduleDate(sched.date),
      timeLabel: formatTimeRange(sched.start_time, sched.end_time),
      locationLabel: patientLocationLabel(patient),
      caregiverName,
      caregiverTitle,
      requestedAtLabel: formatRequestedAt(row.created_at),
    })
  }

  unassignmentItems.sort((a, b) => {
    const sa = scheduleById.get(a.visitId)
    const sb = scheduleById.get(b.visitId)
    if (!sa || !sb) return 0
    return sa.date.localeCompare(sb.date) || formatTimePart(sa.start_time).localeCompare(formatTimePart(sb.start_time))
  })

  const resolved: ResolvedAssignmentRowDTO[] = []
  for (const row of resolvedRows) {
    const sched = scheduleById.get(row.schedule_id)
    const patient = sched ? patientById.get(sched.patient_id) : undefined
    const staff = staffById.get(row.caregiver_member_id)
    if (!sched || !patient || !staff || !row.resolved_at) continue

    const caregiverName = [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'Caregiver'
    resolved.push({
      id: row.id,
      requestType: 'assignment',
      kind: row.status === 'approved' ? 'approved' : 'declined',
      caregiverName,
      visitTitle: visitTitleFromSchedule(sched, taskNameById),
      clientName: patientFullName(patient as { first_name: string; last_name: string }),
      visitDateLabel: formatScheduleDate(sched.date),
      resolvedAtLabel: formatResolvedAt(row.resolved_at),
      reason: (row.decline_reason ?? '').trim() || undefined,
    })
  }

  for (const row of resolvedUnassignRows) {
    const sched = scheduleById.get(row.schedule_id)
    const patient = sched ? patientById.get(sched.patient_id) : undefined
    const staff = staffById.get(row.caregiver_member_id)
    if (!sched || !patient || !staff || !row.resolved_at) continue

    const caregiverName = [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'Caregiver'
    resolved.push({
      id: row.id,
      requestType: 'unassignment',
      kind: row.status === 'approved' ? 'approved' : 'declined',
      caregiverName,
      visitTitle: visitTitleFromSchedule(sched, taskNameById),
      clientName: patientFullName(patient as { first_name: string; last_name: string }),
      visitDateLabel: formatScheduleDate(sched.date),
      resolvedAtLabel: formatResolvedAt(row.resolved_at),
      reason: (row.decline_reason ?? '').trim() || undefined,
    })
  }

  return {
    visits,
    unassignmentItems,
    resolved,
    assignmentApprovedTotal,
    assignmentDeclinedTotal,
    unassignmentApprovedTotal,
    unassignmentDeclinedTotal,
  }
}

export async function getPendingAssignmentRequestCountForBadge(
  agencyId: string | null
): Promise<{ count: number; error?: string }> {
  const data = await fetchVisitAssignmentDashboardData(agencyId)
  if (data.error) return { count: 0, error: data.error }
  const assignmentCount = data.visits.reduce((sum, v) => sum + v.requests.length, 0)
  const count = assignmentCount + data.unassignmentItems.length
  return { count }
}
