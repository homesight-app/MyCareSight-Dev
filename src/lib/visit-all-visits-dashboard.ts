import zipcodes from 'zipcodes'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import type { ScheduleRow } from '@/lib/supabase/query/schedules'
import { patientFullName } from '@/lib/patient-name'
import { managerGetSchedulesByAgencyAndRange } from '@/lib/repositories/manager-scheduling'
import { visitStatusFromScheduleRow, visitStatusLabel, type VisitStatus } from '@/lib/visit-status'
import { decodeVisitTaskCodes, extractVisitTaskToken, isUuidToken } from '@/lib/visit-task-codes'
import { normalizeUsZipForLookup } from '@/lib/us-postal-code'

export type { VisitStatus } from '@/lib/visit-status'

export type ReassignCandidateDTO = {
  id: string
  caregiverName: string
  caregiverTitle: string
  distanceMiles: number
  skillMatchPercent: number
  proximityPercent: number
  overallPercent: number
  matchedSkills: string[]
  isCurrent: boolean
}

export type AllVisitCardDTO = {
  id: string
  date: string
  dateLabel: string
  timeLabel: string
  visitTitle: string
  status: VisitStatus
  statusLabel: string
  typeLabel: string
  clientId: string
  clientName: string
  locationLabel: string
  caregiverId: string | null
  caregiverName: string | null
  adlTasks: string[]
  notes: string | null
  statusReason: string | null
  clientRequiredSkills: string[]
  clientPreferredSkills: string[]
  reassignCandidates: ReassignCandidateDTO[]
  shiftOffer: {
    id: string
    notifiedCount: number
    interestedCount: number
    declinedCount: number
  } | null
}

export type AllVisitsDashboardDTO = {
  allVisits: AllVisitCardDTO[]
  allClients: Array<{ id: string; name: string }>
  allCaregivers: Array<{ id: string; name: string }>
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

function formatScheduleDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTimePart(t: string | null | undefined): string {
  if (!t) return ''
  return String(t).slice(0, 5)
}

function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = formatTimePart(start)
  const b = formatTimePart(end)
  if (a && b) return `${a} - ${b}`
  return a || b || '-'
}

function visitTitleFromSchedule(s: ScheduleRow): string {
  const t = (s.type ?? '').trim()
  if (t) return t
  const d = (s.description ?? '').trim()
  if (d) return d.length > 80 ? `${d.slice(0, 77)}...` : d
  return 'Care visit'
}

function patientLocationLabel(patient: PatientRow): string {
  const z = normalizeUsZipForLookup(patient.zip_code)
  if (z) {
    const loc = zipcodes.lookup(z)
    if (loc?.city && loc?.state) return `${loc.city}, ${loc.state}`
  }
  if (patient.city && patient.state) return `${patient.city}, ${patient.state}`
  if (patient.state) return String(patient.state)
  if (patient.street_address) return String(patient.street_address).split(',')[0]?.trim() || '-'
  return '-'
}

function typeLabel(s: ScheduleRow): string {
  const t = (s.type ?? '').trim()
  return t || 'Routine'
}

export async function fetchAllVisitsDashboardData(agencyId: string | null): Promise<AllVisitsDashboardDTO> {
  type MinRow = { id: string; first_name: string | null; last_name: string | null }
  if (!agencyId) return { allVisits: [], allClients: [], allCaregivers: [] }

  const { startDate, endDate } = q.getDefaultScheduledVisitBulkDateRange()

  const [visitsRes, allPatientsData, allStaffDataAll] = await Promise.all([
    managerGetSchedulesByAgencyAndRange(agencyId, startDate, endDate),
    sql<MinRow[]>`
      SELECT id, first_name, last_name
      FROM patients
      WHERE agency_id = ${agencyId}
      ORDER BY last_name ASC
    `,
    sql<MinRow[]>`
      SELECT id, first_name, last_name
      FROM caregiver_members
      WHERE agency_id = ${agencyId}
      ORDER BY first_name ASC
    `,
  ])

  const schedules = (visitsRes.error ? [] : (visitsRes.data ?? [])) as ScheduleRow[]
  const allClients = allPatientsData.map((p) => ({
    id: p.id,
    name: patientFullName({ first_name: p.first_name ?? '', last_name: p.last_name ?? '' }),
  }))
  const allCaregivers = allStaffDataAll.map((s) => ({
    id: s.id,
    name: [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Caregiver',
  }))
  if (schedules.length === 0) return { allVisits: [], allClients, allCaregivers }

  const patientIds = Array.from(new Set(schedules.map((s) => s.patient_id)))
  const visitIds = schedules.map(schedule => schedule.id)
  const [patientsData, reqResult, offerRows] = await Promise.all([
    sql<PatientRow[]>`
      SELECT id, first_name, last_name, zip_code, state, city, street_address
      FROM patients WHERE id = ANY(${patientIds}::uuid[])
    `,
    q.getCaregiverRequirementsByPatientIds(patientIds),
    sql<{
      id: string
      scheduled_visit_id: string
      notified_count: number
      interested_count: number
      declined_count: number
    }[]>`
      SELECT offer.id, offer.scheduled_visit_id,
        count(recipient.id)::integer AS notified_count,
        count(recipient.id) FILTER (WHERE recipient.status = 'interested')::integer AS interested_count,
        count(recipient.id) FILTER (WHERE recipient.status = 'not_interested')::integer AS declined_count
      FROM public.visit_shift_offers offer
      LEFT JOIN public.visit_shift_offer_recipients recipient ON recipient.offer_id = offer.id
      WHERE offer.agency_id = ${agencyId}::uuid
        AND offer.scheduled_visit_id = ANY(${visitIds}::uuid[])
        AND offer.status = 'open'
        AND offer.expires_at > now()
      GROUP BY offer.id, offer.scheduled_visit_id
    `,
  ])

  const patientById = new Map(patientsData.map((p) => [p.id, p]))
  type MinStaffRow = { id: string; first_name?: string | null; last_name?: string | null }
  const staffById = new Map<string, MinStaffRow>(allStaffDataAll.map((s) => [s.id, s]))

  const requirementsByPatient = new Map<string, { required: string[]; preferred: string[] }>()
  for (const row of reqResult.data ?? []) {
    const pr = row as { patient_id?: string; skill_codes?: string[]; preferred_skill_codes?: string[] }
    if (pr.patient_id) requirementsByPatient.set(pr.patient_id, {
      required: Array.isArray(pr.skill_codes) ? pr.skill_codes : [],
      preferred: Array.isArray(pr.preferred_skill_codes) ? pr.preferred_skill_codes : [],
    })
  }
  const offerByVisit = new Map(offerRows.map(row => [row.scheduled_visit_id, {
    id: row.id,
    notifiedCount: Number(row.notified_count),
    interestedCount: Number(row.interested_count),
    declinedCount: Number(row.declined_count),
  }]))

  const taskIdTokens = Array.from(
    new Set(
      schedules
        .flatMap((s) => s.adl_codes ?? [])
        .map((raw) => extractVisitTaskToken(raw))
        .filter(isUuidToken)
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

  const allVisits: AllVisitCardDTO[] = schedules.map((s) => {
    const patient = patientById.get(s.patient_id)
    const currentCaregiver = s.caregiver_id ? staffById.get(s.caregiver_id) : undefined
    const skillRequirements = requirementsByPatient.get(s.patient_id) ?? { required: [], preferred: [] }
    const status = visitStatusFromScheduleRow(s)
    return {
      id: s.id,
      date: s.date,
      dateLabel: formatScheduleDate(s.date),
      timeLabel: formatTimeRange(s.start_time, s.end_time),
      visitTitle: visitTitleFromSchedule(s),
      status,
      statusLabel: visitStatusLabel(status),
      typeLabel: typeLabel(s),
      clientId: s.patient_id,
      clientName: patient ? patientFullName(patient as { first_name: string; last_name: string }) : 'Client',
      locationLabel: patient ? patientLocationLabel(patient) : '-',
      caregiverId: s.caregiver_id,
      caregiverName: currentCaregiver ? [currentCaregiver.first_name, currentCaregiver.last_name].filter(Boolean).join(' ') : null,
      adlTasks: decodeVisitTaskCodes(s.adl_codes, taskNameById),
      notes: s.notes,
      statusReason: s.status_reason ?? null,
      clientRequiredSkills: skillRequirements.required,
      clientPreferredSkills: skillRequirements.preferred,
      reassignCandidates: [],
      shiftOffer: offerByVisit.get(s.id) ?? null,
    }
  })

  return { allVisits, allClients, allCaregivers }
}
