import type { Supabase } from '@/lib/supabase/types'
import * as q from '@/lib/supabase/query'
import type { ScheduleRow } from '@/lib/supabase/query/schedules'
import { patientFullName } from '@/lib/patient-name'

export type CaregiverExecutionTaskDTO = {
  id: string
  name: string
  tags: string[]
  asNeeded: boolean
  completed: boolean
}

export type CaregiverVisitExecutionDTO = {
  visitId: string
  clientName: string
  serviceName: string
  dateLabel: string
  dateLabelLong: string
  timeLabel: string
  durationLabel: string
  locationLine: string
  locationShort: string
  visitStatus: string
  /** UI label: Not Started | In Progress | Completed | Missed */
  statusLabel: string
  tasks: CaregiverExecutionTaskDTO[]
  timeEntryId: string | null
  clockInAt: string | null
  clockOutAt: string | null
  caregiverNotes: string | null
  canExecute: boolean
}

type PatientRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  city?: string | null
  state?: string | null
  street_address?: string | null
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
  if (s && e) return `${s} – ${e}`
  return s || e || '-'
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

function slotKeyFromLegacy(raw: string): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  const parts = v.split('::')
  return parts.length > 1 ? parts[0].trim().toLowerCase() : ''
}

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function serviceTypeTag(serviceType: string | null | undefined): string {
  const s = (serviceType ?? '').toLowerCase()
  if (s === 'skilled') return 'Skilled Care'
  return 'Personal Care'
}

function firstRel<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function deriveStatusLabel(
  row: ScheduleRow,
  clockInAt: string | null,
  clockOutAt: string | null
): string {
  const st = (row.status ?? '').toLowerCase().trim()
  if (st === 'missed') return 'Missed'
  if (st === 'completed') return 'Completed'
  if (st === 'in_progress' || (clockInAt && !clockOutAt)) return 'In Progress'
  return 'Not Started'
}

type TaskCatalogEmbed = {
  name: string
  code: string
  task_categories: { name: string } | { name: string }[] | null
}

type TaskRowDb = {
  id: string
  legacy_task_code: string | null
  sort_order: number
  completed_at: string | null
  task_id: string | null
  notes?: string | null
  task_catalog: TaskCatalogEmbed | TaskCatalogEmbed[] | null
}

export type CaregiverPastVisitSummaryTaskDTO = {
  id: string
  name: string
  categoryLabel: string
  completed: boolean
  completedAtLabel: string | null
  instructions: string | null
}

export type CaregiverPastVisitSummaryDTO = {
  visitId: string
  clientName: string
  dateSubtitle: string
  serviceName: string
  locationShort: string
  scheduledTimeRange: string
  statusLabel: string
  clockInLabel: string | null
  clockOutLabel: string | null
  caregiverNotes: string | null
  scheduleNotes: string | null
  tasks: CaregiverPastVisitSummaryTaskDTO[]
}

function formatScheduleWindowAmPm(start: string | null, end: string | null): string {
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

function formatInstantAmPm(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Read-only summary for Past tab modal (assigned caregiver only). */
export async function fetchCaregiverPastVisitSummary(
  supabase: Supabase,
  visitId: string,
  caregiverMemberId: string,
  caregiverAgencyId: string | null
): Promise<{ data: CaregiverPastVisitSummaryDTO | null; error?: string }> {
  const { data: rows, error: visitErr } = await q.getScheduledVisitsByIdsAsScheduleRows(supabase, [visitId])
  if (visitErr || !rows?.length) {
    return { data: null, error: visitErr?.message || 'Visit not found.' }
  }
  const row = rows[0]!
  const assignedId = String(row.caregiver_id ?? '').toLowerCase()
  const memberId = String(caregiverMemberId ?? '').toLowerCase()
  if (!assignedId || assignedId !== memberId) {
    return { data: null, error: 'You are not assigned to this visit.' }
  }
  if (caregiverAgencyId && row.agency_id !== caregiverAgencyId) {
    return { data: null, error: 'Visit not found.' }
  }

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, city, state, street_address')
    .eq('id', row.patient_id)
    .maybeSingle()

  const p = patient as PatientRow | null
  const locationShort = [p?.city?.trim(), p?.state?.trim()].filter(Boolean).join(', ') || '-'
  const clientName = p ? patientFullName(p as { first_name: string; last_name: string }) : 'Client'

  const taskSelectFull = `
      id,
      legacy_task_code,
      sort_order,
      completed_at,
      notes,
      task_id,
      task_catalog (
        name,
        code,
        task_categories ( name )
      )
    `
  const taskFull = await supabase
    .from('scheduled_visit_tasks')
    .select(taskSelectFull)
    .eq('scheduled_visit_id', visitId)
    .order('sort_order', { ascending: true })

  const taskBasic =
    taskFull.error != null
      ? await supabase
          .from('scheduled_visit_tasks')
          .select('id, legacy_task_code, sort_order, task_id, notes, completed_at')
          .eq('scheduled_visit_id', visitId)
          .order('sort_order', { ascending: true })
      : null

  if (taskFull.error != null && taskBasic?.error) {
    return { data: null, error: taskBasic.error.message }
  }

  const rawTasks = (taskFull.error != null ? (taskBasic?.data ?? []) : (taskFull.data ?? [])) as TaskRowDb[]
  const uuidTokens = Array.from(
    new Set(
      rawTasks
        .map((t) => extractTaskToken(t.legacy_task_code ?? ''))
        .filter((token) => token && isUuidLike(token))
    )
  )

  const taskNameById = new Map<string, string>()
  if (uuidTokens.length > 0) {
    const { data: catRows } = await supabase.from('task_catalog').select('id, name, code').in('id', uuidTokens)
    for (const r of catRows ?? []) {
      const rec = r as { id?: string; name?: string | null; code?: string | null }
      const id = (rec.id ?? '').trim()
      if (!id) continue
      const label = (rec.name ?? '').trim() || (rec.code ?? '').trim()
      if (label) taskNameById.set(id, label)
    }
  }

  const svcTag = serviceTypeTag(row.service_type)
  const typeLabel = (row.type ?? '').trim() || svcTag

  const tasks: CaregiverPastVisitSummaryTaskDTO[] = rawTasks.map((t) => {
    const legacy = t.legacy_task_code ?? ''
    const token = extractTaskToken(legacy)
    const catRow = firstRel(t.task_catalog)
    const fromCatalog = catRow?.name?.trim()
    const fromMap = token ? taskNameById.get(token) : undefined
    const name = (fromCatalog && fromCatalog.length > 0 ? fromCatalog : fromMap) || token || 'Task'

    const catMeta = firstRel(catRow?.task_categories as { name?: string | null } | null)
    const categoryName = catMeta?.name?.trim() || null
    const categoryLabel = (categoryName || typeLabel || 'Tasks').toUpperCase()

    const completed = !!t.completed_at
    const instructions = t.notes?.trim() ? t.notes.trim() : null

    return {
      id: t.id,
      name,
      categoryLabel,
      completed,
      completedAtLabel: completed ? formatInstantAmPm(t.completed_at) : null,
      instructions,
    }
  })

  let vteRes = await supabase
    .from('visit_time_entries')
    .select('clock_in_time, clock_out_time, caregiver_notes')
    .eq('scheduled_visit_id', visitId)
    .maybeSingle()

  if (vteRes.error) {
    vteRes = await supabase
      .from('visit_time_entries')
      .select('clock_in_time, clock_out_time')
      .eq('scheduled_visit_id', visitId)
      .maybeSingle()
  }

  if (vteRes.error) {
    return { data: null, error: vteRes.error.message }
  }

  const entry = vteRes.data as {
    clock_in_time: string | null
    clock_out_time: string | null
    caregiver_notes?: string | null
  } | null

  const clockInAt = entry?.clock_in_time ?? null
  const clockOutAt = entry?.clock_out_time ?? null
  const statusLabel = deriveStatusLabel(row, clockInAt, clockOutAt)

  return {
    data: {
      visitId: row.id,
      clientName,
      dateSubtitle: formatDateLabelLong(row.date),
      serviceName: typeLabel,
      locationShort,
      scheduledTimeRange: formatScheduleWindowAmPm(row.start_time, row.end_time),
      statusLabel,
      clockInLabel: formatInstantAmPm(clockInAt),
      clockOutLabel: formatInstantAmPm(clockOutAt),
      caregiverNotes: entry?.caregiver_notes?.trim() ? entry.caregiver_notes.trim() : null,
      scheduleNotes: row.notes?.trim() ? row.notes.trim() : null,
      tasks,
    },
  }
}

export async function fetchCaregiverVisitExecutionDetail(
  supabase: Supabase,
  visitId: string,
  caregiverMemberId: string,
  caregiverAgencyId: string | null
): Promise<{ data: CaregiverVisitExecutionDTO | null; error?: string }> {
  const { data: rows, error: visitErr } = await q.getScheduledVisitsByIdsAsScheduleRows(supabase, [visitId])
  if (visitErr || !rows?.length) {
    return { data: null, error: visitErr?.message || 'Visit not found.' }
  }
  const row = rows[0]!
  const assignedId = String(row.caregiver_id ?? '').toLowerCase()
  const memberId = String(caregiverMemberId ?? '').toLowerCase()
  if (!assignedId || assignedId !== memberId) {
    return { data: null, error: 'You are not assigned to this visit.' }
  }
  // When agency_id is set on the caregiver row, it must match the visit (list view uses the same rule).
  if (caregiverAgencyId && row.agency_id !== caregiverAgencyId) {
    return { data: null, error: 'Visit not found.' }
  }

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, city, state, street_address')
    .eq('id', row.patient_id)
    .maybeSingle()

  const p = patient as PatientRow | null
  const locationShort = [p?.city?.trim(), p?.state?.trim()].filter(Boolean).join(', ') || '-'
  const clientName = p ? patientFullName(p as { first_name: string; last_name: string }) : 'Client'
  const locationLine = p?.street_address?.trim() || '-'

  const taskSelectFull = `
      id,
      legacy_task_code,
      sort_order,
      completed_at,
      task_id,
      task_catalog (
        name,
        code,
        task_categories ( name )
      )
    `
  const taskFull = await supabase
    .from('scheduled_visit_tasks')
    .select(taskSelectFull)
    .eq('scheduled_visit_id', visitId)
    .order('sort_order', { ascending: true })

  const taskBasic =
    taskFull.error != null
      ? await supabase
          .from('scheduled_visit_tasks')
          .select('id, legacy_task_code, sort_order, task_id')
          .eq('scheduled_visit_id', visitId)
          .order('sort_order', { ascending: true })
      : null

  if (taskFull.error != null) {
    if (taskBasic?.error) {
      return { data: null, error: taskBasic.error.message }
    }
  }

  const rawTasks = (taskFull.error != null ? (taskBasic?.data ?? []) : (taskFull.data ?? [])) as TaskRowDb[]
  const uuidTokens = Array.from(
    new Set(
      rawTasks
        .map((t) => extractTaskToken(t.legacy_task_code ?? ''))
        .filter((token) => token && isUuidLike(token))
    )
  )

  const taskNameById = new Map<string, string>()
  if (uuidTokens.length > 0) {
    const { data: catRows } = await supabase.from('task_catalog').select('id, name, code').in('id', uuidTokens)
    for (const r of catRows ?? []) {
      const rec = r as { id?: string; name?: string | null; code?: string | null }
      const id = (rec.id ?? '').trim()
      if (!id) continue
      const label = (rec.name ?? '').trim() || (rec.code ?? '').trim()
      if (label) taskNameById.set(id, label)
    }
  }

  const svcTag = serviceTypeTag(row.service_type)
  const typeLabel = (row.type ?? '').trim() || svcTag

  const tasks: CaregiverExecutionTaskDTO[] = rawTasks.map((t) => {
    const legacy = t.legacy_task_code ?? ''
    const token = extractTaskToken(legacy)
    const asNeeded = slotKeyFromLegacy(legacy) === 'as_needed'
    const catRow = firstRel(t.task_catalog)
    const fromCatalog = catRow?.name?.trim()
    const fromMap = token ? taskNameById.get(token) : undefined
    const name = (fromCatalog && fromCatalog.length > 0 ? fromCatalog : fromMap) || token || 'Task'

    const catMeta = firstRel(catRow?.task_categories as { name?: string | null } | null)
    const categoryName = catMeta?.name?.trim() || null
    const tags = [categoryName, typeLabel !== categoryName ? typeLabel : null].filter(Boolean) as string[]

    return {
      id: t.id,
      name,
      tags,
      asNeeded,
      completed: !!t.completed_at,
    }
  })

  let vteRes = await supabase
    .from('visit_time_entries')
    .select('id, clock_in_time, clock_out_time, caregiver_notes')
    .eq('scheduled_visit_id', visitId)
    .maybeSingle()

  if (vteRes.error) {
    vteRes = await supabase
      .from('visit_time_entries')
      .select('id, clock_in_time, clock_out_time')
      .eq('scheduled_visit_id', visitId)
      .maybeSingle()
  }

  if (vteRes.error) {
    return { data: null, error: vteRes.error.message }
  }

  const entry = vteRes.data as {
    id: string
    clock_in_time: string | null
    clock_out_time: string | null
    caregiver_notes?: string | null
  } | null

  const clockInAt = entry?.clock_in_time ?? null
  const clockOutAt = entry?.clock_out_time ?? null
  const statusLabel = deriveStatusLabel(row, clockInAt, clockOutAt)

  const st = (row.status ?? '').toLowerCase().trim()
  const canExecute = st !== 'missed' && st !== 'completed'

  return {
    data: {
      visitId: row.id,
      clientName,
      serviceName: typeLabel,
      dateLabel: formatDateLabel(row.date),
      dateLabelLong: formatDateLabelLong(row.date),
      timeLabel: formatTimeLabel(row.start_time, row.end_time),
      durationLabel: formatDurationLabel(row.start_time, row.end_time),
      locationLine,
      locationShort,
      visitStatus: row.status ?? 'scheduled',
      statusLabel,
      tasks,
      timeEntryId: entry?.id ?? null,
      clockInAt,
      clockOutAt,
      caregiverNotes: entry?.caregiver_notes?.trim() ? entry.caregiver_notes : null,
      canExecute,
    },
  }
}
