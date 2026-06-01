import type { Supabase } from '../types'

/** Status transitions from wall-clock: DB trigger on write + pg_cron `sync_scheduled_visit_statuses` (migration 076), not each read. */

/** Default inclusive `visit_date` window for cross-tenant / bulk scheduled-visit reads (memory & timeout safety). */
const DEFAULT_VISIT_BULK_LOOKBACK_DAYS = 730
const DEFAULT_VISIT_BULK_LOOKAHEAD_DAYS = 400

function formatDateYmdUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export type ScheduledVisitBulkDateRange = { startDate: string; endDate: string }

/** Inclusive `visit_date` bounds used when callers do not pass an explicit range. */
export function getDefaultScheduledVisitBulkDateRange(now: Date = new Date()): ScheduledVisitBulkDateRange {
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - DEFAULT_VISIT_BULK_LOOKBACK_DAYS)
  const end = new Date(now)
  end.setUTCDate(end.getUTCDate() + DEFAULT_VISIT_BULK_LOOKAHEAD_DAYS)
  return { startDate: formatDateYmdUtc(start), endDate: formatDateYmdUtc(end) }
}

/** Shape expected by visit dashboards and client visit UI (maps from scheduled_visits + tasks). */
export interface ScheduleRow {
  id: string
  agency_id: string
  patient_id: string
  caregiver_id: string | null
  contract_id: string | null
  service_type: string | null
  /** Encoded as `slotKey::adlName` or plain ADL name; sourced from scheduled_visit_tasks.legacy_task_code */
  adl_codes: string[]
  date: string
  start_time: string | null
  end_time: string | null
  description: string | null
  type: string | null
  notes: string | null
  is_recurring: boolean | null
  repeat_frequency: string | null
  days_of_week: number[] | null
  repeat_monthly_rules: { ordinal: number; weekday: number }[] | null
  repeat_start: string | null
  repeat_end: string | null
  status: string | null
  created_at: string
  updated_at: string
  patient_address_id?: string | null
  mileage_miles?: number | null
  patient_address?: { id: string; zip_code: string; street_address: string; city: string; state: string; label: string } | null
  end_date?: string | null
}

const visitSelect = `
  id,
  agency_id,
  patient_id,
  caregiver_member_id,
  contract_id,
  service_type,
  visit_date,
  scheduled_start_time,
  scheduled_end_time,
  description,
  notes,
  visit_type,
  status,
  is_recurring,
  created_at,
  updated_at,
  patient_address_id,
  mileage_miles,
  scheduled_end_date,
  patient_address:patient_addresses(id, zip_code, street_address, city, state, label)
`

/** Same columns as {@link visitSelect} plus nested ADL/task rows (one round-trip). */
const visitSelectWithTasks = `${visitSelect.trimEnd()},
  scheduled_visit_tasks(legacy_task_code, sort_order),
  visit_series(repeat_frequency, days_of_week, repeat_start, repeat_end, repeat_monthly_rules)
`

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function normalizeTimePart(v: string | null | undefined): string | null {
  if (!v) return null
  const raw = String(v).trim().slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(raw)) return null
  return raw
}

function toUtcVisitParts(date: string, startTime: string | null, endTime: string | null): {
  visitDateUtc: string
  startTimeUtc: string | null
  endTimeUtc: string | null
} {
  const [yy, mm, dd] = date.split('-').map(Number)
  const mkUtc = (time: string | null, fallbackHour: number, fallbackMinute: number) => {
    const t = normalizeTimePart(time)
    const h = t ? Number(t.slice(0, 2)) : fallbackHour
    const m = t ? Number(t.slice(3, 5)) : fallbackMinute
    const local = new Date(yy, (mm ?? 1) - 1, dd ?? 1, h, m, 0, 0)
    return {
      date: `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`,
      time: `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`,
    }
  }

  const startUtc = mkUtc(startTime, 0, 0)
  const endUtc = endTime ? mkUtc(endTime, 0, 0) : null
  return {
    visitDateUtc: startUtc.date,
    startTimeUtc: startTime ? startUtc.time : null,
    endTimeUtc: endUtc?.time ?? null,
  }
}

function toLocalVisitParts(
  visitDateUtc: string,
  startTimeUtc: string | null,
  endTimeUtc: string | null
): { visitDateLocal: string; startTimeLocal: string | null; endTimeLocal: string | null } {
  const [yy, mm, dd] = visitDateUtc.split('-').map(Number)
  const mkLocal = (time: string | null, fallbackHour: number, fallbackMinute: number) => {
    const t = normalizeTimePart(time)
    const h = t ? Number(t.slice(0, 2)) : fallbackHour
    const m = t ? Number(t.slice(3, 5)) : fallbackMinute
    const utcDate = new Date(Date.UTC(yy, (mm ?? 1) - 1, dd ?? 1, h, m, 0, 0))
    return {
      date: `${utcDate.getFullYear()}-${pad2(utcDate.getMonth() + 1)}-${pad2(utcDate.getDate())}`,
      time: `${pad2(utcDate.getHours())}:${pad2(utcDate.getMinutes())}`,
    }
  }

  const startLocal = mkLocal(startTimeUtc, 0, 0)
  const endLocal = endTimeUtc ? mkLocal(endTimeUtc, 0, 0) : null
  return {
    visitDateLocal: startLocal.date,
    startTimeLocal: startTimeUtc ? startLocal.time : null,
    endTimeLocal: endLocal?.time ?? null,
  }
}

type ScheduledVisitDbRow = {
  id: string
  agency_id: string
  patient_id: string
  caregiver_member_id: string | null
  contract_id: string | null
  service_type: string | null
  visit_date: string
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  description: string | null
  notes: string | null
  visit_type: string | null
  status: string
  is_recurring: boolean
  created_at: string
  updated_at: string
}

type ScheduledVisitTaskNested = {
  legacy_task_code: string | null
  sort_order: number | null
}

type ScheduledVisitDbRowWithTasks = ScheduledVisitDbRow & {
  scheduled_visit_tasks?: ScheduledVisitTaskNested[] | null
  visit_series?: VisitSeriesNested | VisitSeriesNested[] | null
}

type VisitSeriesNested = {
  repeat_frequency: string | null
  days_of_week: number[] | null
  repeat_start: string | null
  repeat_end: string | null
  repeat_monthly_rules: unknown
}

function parseMonthlyRules(raw: unknown): { ordinal: number; weekday: number }[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const out: { ordinal: number; weekday: number }[] = []
  for (const item of raw) {
    if (item && typeof item === 'object' && 'ordinal' in item && 'weekday' in item) {
      const o = (item as { ordinal: unknown; weekday: unknown }).ordinal
      const w = (item as { ordinal: unknown; weekday: unknown }).weekday
      if (typeof o === 'number' && typeof w === 'number') out.push({ ordinal: o, weekday: w })
    }
  }
  return out.length ? out : null
}

function firstRel<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function toScheduleRow(v: ScheduledVisitDbRowWithTasks, adlCodes: string[]): ScheduleRow {
  const localParts = toLocalVisitParts(v.visit_date, v.scheduled_start_time, v.scheduled_end_time)
  const series = firstRel(v.visit_series)
  return {
    id: v.id,
    agency_id: v.agency_id,
    patient_id: v.patient_id,
    caregiver_id: v.caregiver_member_id,
    contract_id: v.contract_id,
    service_type: v.service_type,
    adl_codes: adlCodes,
    date: localParts.visitDateLocal,
    start_time: localParts.startTimeLocal,
    end_time: localParts.endTimeLocal,
    description: v.description,
    type: v.visit_type,
    notes: v.notes,
    is_recurring: v.is_recurring,
    repeat_frequency: series?.repeat_frequency ?? null,
    days_of_week: series?.days_of_week ?? null,
    repeat_monthly_rules: parseMonthlyRules(series?.repeat_monthly_rules),
    repeat_start: series?.repeat_start ?? null,
    repeat_end: series?.repeat_end ?? null,
    status: v.status,
    created_at: v.created_at,
    updated_at: v.updated_at,
    patient_address_id: (v as any).patient_address_id ?? null,
    mileage_miles: (v as any).mileage_miles ?? null,
    patient_address: (v as any).patient_address ?? null,
    end_date: (v as any).scheduled_end_date ?? null,
  }
}

function adlCodesFromNestedTasks(tasks: ScheduledVisitTaskNested[] | null | undefined): string[] {
  const rows = (tasks ?? [])
    .map((t) => ({
      code: (t.legacy_task_code ?? '').trim(),
      sort_order: t.sort_order ?? 0,
    }))
    .filter((t) => t.code)
  rows.sort((a, b) => a.sort_order - b.sort_order)
  return rows.map((t) => t.code)
}

/** Maps DB visit rows (with optional inline `scheduled_visit_tasks`) to {@link ScheduleRow}. */
function mapVisitsToScheduleRows(visits: ScheduledVisitDbRowWithTasks[]): ScheduleRow[] {
  if (visits.length === 0) return []
  return visits.map((v) => toScheduleRow(v, adlCodesFromNestedTasks(v.scheduled_visit_tasks)))
}

/** Get all visits for a patient as ScheduleRow[]. */
export async function getSchedulesByPatientId(supabase: Supabase, patientId: string) {
  const { data, error } = await supabase
    .from('scheduled_visits')
    .select(visitSelectWithTasks)
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: true })
    .order('scheduled_start_time', { ascending: true })

  if (error) return { data: null, error }
  const rows = (data ?? []) as unknown as ScheduledVisitDbRowWithTasks[]
  const mapped = mapVisitsToScheduleRows(rows)
  return { data: mapped, error: null }
}

/** Visits for a patient in an inclusive date range. */
export async function getSchedulesByPatientIdAndDateRange(
  supabase: Supabase,
  patientId: string,
  startDate: string,
  endDate: string
) {
  const { data, error } = await supabase
    .from('scheduled_visits')
    .select(visitSelectWithTasks)
    .eq('patient_id', patientId)
    .gte('visit_date', startDate)
    .lte('visit_date', endDate)
    .order('visit_date', { ascending: true })
    .order('scheduled_start_time', { ascending: true })

  if (error) return { data: null, error }
  const rows = (data ?? []) as unknown as ScheduledVisitDbRowWithTasks[]
  const mapped = mapVisitsToScheduleRows(rows)
  return { data: mapped, error: null }
}

/**
 * Cross-tenant scheduled visits (e.g. admin all-visits dashboard), newest `visit_date` first.
 * When `startDate`/`endDate` are omitted, uses {@link getDefaultScheduledVisitBulkDateRange} so the query stays bounded as data grows.
 */
export async function getAllScheduledVisitsAsScheduleRows(
  supabase: Supabase,
  options?: { startDate?: string; endDate?: string }
) {
  const { startDate, endDate } =
    options?.startDate != null && options?.endDate != null
      ? { startDate: options.startDate, endDate: options.endDate }
      : getDefaultScheduledVisitBulkDateRange()

  const { data, error } = await supabase
    .from('scheduled_visits')
    .select(visitSelectWithTasks)
    .gte('visit_date', startDate)
    .lte('visit_date', endDate)
    .order('visit_date', { ascending: false })
    .order('scheduled_start_time', { ascending: true })

  if (error) return { data: null, error }
  const rows = (data ?? []) as unknown as ScheduledVisitDbRowWithTasks[]
  const mapped = mapVisitsToScheduleRows(rows)
  return { data: mapped, error: null }
}

/** Visits for one agency in an inclusive date range (for overlap checks in scheduling UI). */
export async function getScheduledVisitsAsScheduleRowsForAgencyAndDateRange(
  supabase: Supabase,
  agencyId: string,
  startDate: string,
  endDate: string
) {
  const { data, error } = await supabase
    .from('scheduled_visits')
    .select(visitSelectWithTasks)
    .eq('agency_id', agencyId)
    .gte('visit_date', startDate)
    .lte('visit_date', endDate)
    .order('visit_date', { ascending: true })
    .order('scheduled_start_time', { ascending: true })

  if (error) return { data: null, error }
  const rows = (data ?? []) as unknown as ScheduledVisitDbRowWithTasks[]
  const mapped = mapVisitsToScheduleRows(rows)
  return { data: mapped, error: null }
}

/** Visits by primary key (e.g. assignment requests referencing schedule_id = visit id). */
export async function getScheduledVisitsByIdsAsScheduleRows(supabase: Supabase, ids: string[]) {
  const clean = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0 && id !== 'null')))
  if (clean.length === 0) return { data: [], error: null }
  const { data, error } = await supabase.from('scheduled_visits').select(visitSelectWithTasks).in('id', clean)
  if (error) return { data: null, error }
  const rows = (data ?? []) as unknown as ScheduledVisitDbRowWithTasks[]
  const mapped = mapVisitsToScheduleRows(rows)
  return { data: mapped, error: null }
}

async function requirePatientAgencyId(
  supabase: Supabase,
  patientId: string
): Promise<{ agency_id: string } | { error: { message: string } }> {
  const { data, error } = await supabase.from('patients').select('agency_id').eq('id', patientId).single()
  if (error) return { error: { message: error.message } }
  const agencyId = (data as { agency_id: string | null })?.agency_id
  if (!agencyId) {
    return { error: { message: 'Patient must belong to an agency before scheduling visits.' } }
  }
  return { agency_id: agencyId }
}

async function replaceVisitTasks(
  supabase: Supabase,
  agencyId: string,
  visitId: string,
  adlCodes: string[] | undefined
) {
  await supabase.from('scheduled_visit_tasks').delete().eq('scheduled_visit_id', visitId)
  const codes = adlCodes ?? []
  if (codes.length === 0) return
  const rows = codes.map((code, i) => ({
    agency_id: agencyId,
    scheduled_visit_id: visitId,
    task_id: null as string | null,
    legacy_task_code: code,
    sort_order: i,
  }))
  await supabase.from('scheduled_visit_tasks').insert(rows)
}

async function replaceVisitTasksForMany(
  supabase: Supabase,
  agencyId: string,
  visitIds: string[],
  adlCodes: string[] | undefined
) {
  if (visitIds.length === 0) return
  await supabase.from('scheduled_visit_tasks').delete().in('scheduled_visit_id', visitIds)
  const codes = adlCodes ?? []
  if (codes.length === 0) return
  const rows = visitIds.flatMap((visitId) =>
    codes.map((code, i) => ({
      agency_id: agencyId,
      scheduled_visit_id: visitId,
      task_id: null as string | null,
      legacy_task_code: code,
      sort_order: i,
    }))
  )
  await supabase.from('scheduled_visit_tasks').insert(rows)
}

/** Insert a visit and return the row as ScheduleRow. */
export async function insertSchedule(
  supabase: Supabase,
  data: {
    patient_id: string
    caregiver_id?: string | null
    contract_id?: string | null
    service_type?: string | null
    adl_codes?: string[]
    date: string
    start_time?: string | null
    end_time?: string | null
    description?: string | null
    type?: string | null
    notes?: string | null
    is_recurring?: boolean
    repeat_frequency?: string | null
    days_of_week?: number[] | null
    repeat_monthly_rules?: { ordinal: number; weekday: number }[] | null
    repeat_start?: string | null
    repeat_end?: string | null
    patient_address_id?: string | null
    mileage_miles?: number | null
    end_date?: string | null
  }
) {
  const agency = await requirePatientAgencyId(supabase, data.patient_id)
  if ('error' in agency) return { data: null, error: agency.error }

  const utcParts = toUtcVisitParts(data.date, data.start_time ?? null, data.end_time ?? null)
  const { data: visit, error } = await supabase
    .from('scheduled_visits')
    .insert({
      agency_id: agency.agency_id,
      patient_id: data.patient_id,
      caregiver_member_id: data.caregiver_id ?? null,
      contract_id: data.contract_id ?? null,
      service_type: data.service_type ?? 'non_skilled',
      visit_date: utcParts.visitDateUtc,
      scheduled_start_time: utcParts.startTimeUtc,
      scheduled_end_time: utcParts.endTimeUtc,
      description: data.description ?? null,
      notes: data.notes ?? null,
      visit_type: data.type ?? null,
      status: 'scheduled',
      is_recurring: data.is_recurring ?? false,
      patient_address_id: data.patient_address_id ?? null,
      mileage_miles: data.mileage_miles ?? null,
      ...(data.end_date && data.end_date > data.date ? { scheduled_end_date: data.end_date } : {}),
    })
    .select(visitSelect)
    .single()

  if (error || !visit) return { data: null, error }
  const v = visit as ScheduledVisitDbRowWithTasks
  await replaceVisitTasks(supabase, agency.agency_id, v.id, data.adl_codes)
  const adlCodes = (data.adl_codes ?? []).filter(Boolean)
  return { data: toScheduleRow(v, adlCodes), error: null }
}

/** Create one visit_series template and many dated scheduled_visits linked to it. */
export async function insertRecurringSchedulesFromSeries(
  supabase: Supabase,
  data: {
    patient_id: string
    caregiver_id?: string | null
    contract_id?: string | null
    service_type?: string | null
    adl_codes?: string[]
    dates: string[]
    start_time?: string | null
    end_time?: string | null
    description?: string | null
    type?: string | null
    notes?: string | null
    repeat_frequency?: string | null
    days_of_week?: number[] | null
    repeat_monthly_rules?: { ordinal: number; weekday: number }[] | null
    repeat_start: string
    repeat_end?: string | null
    patient_address_id?: string | null
    mileage_miles?: number | null
    end_day_offset?: number
  }
) {
  if (data.dates.length === 0) return { data: [], error: { message: 'No dates to insert.' } }
  const agency = await requirePatientAgencyId(supabase, data.patient_id)
  if ('error' in agency) return { data: null, error: agency.error }

  const monthly =
    data.repeat_monthly_rules && data.repeat_monthly_rules.length > 0
      ? data.repeat_monthly_rules
      : null

  const endDayOffset = data.end_day_offset ?? 0

  const { data: series, error: seriesError } = await supabase
    .from('visit_series')
    .insert({
      agency_id: agency.agency_id,
      patient_id: data.patient_id,
      primary_caregiver_member_id: data.caregiver_id ?? null,
      contract_id: data.contract_id ?? null,
      service_type: data.service_type ?? 'non_skilled',
      series_name: data.type ?? null,
      repeat_frequency: data.repeat_frequency ?? null,
      days_of_week: data.days_of_week?.length ? data.days_of_week.map((n) => Number(n)) : null,
      repeat_start: data.repeat_start,
      repeat_end: data.repeat_end ?? null,
      repeat_monthly_rules: monthly,
      notes: data.notes ?? null,
      status: 'active',
      end_day_offset: endDayOffset,
    })
    .select('id')
    .single()

  if (seriesError || !series?.id) return { data: null, error: seriesError ?? { message: 'Failed to create visit series.' } }

  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const rows = data.dates.map((dateStr) => {
    const utcParts = toUtcVisitParts(dateStr, data.start_time ?? null, data.end_time ?? null)
    const instanceEndDate = endDayOffset > 0 ? addDays(dateStr, endDayOffset) : null
    return {
      agency_id: agency.agency_id,
      visit_series_id: series.id,
      patient_id: data.patient_id,
      caregiver_member_id: data.caregiver_id ?? null,
      contract_id: data.contract_id ?? null,
      service_type: data.service_type ?? 'non_skilled',
      visit_date: utcParts.visitDateUtc,
      scheduled_start_time: utcParts.startTimeUtc,
      scheduled_end_time: utcParts.endTimeUtc,
      description: data.description ?? null,
      notes: data.notes ?? null,
      visit_type: data.type ?? null,
      status: 'scheduled',
      is_recurring: true,
      patient_address_id: data.patient_address_id ?? null,
      mileage_miles: data.mileage_miles ?? null,
      ...(instanceEndDate ? { scheduled_end_date: instanceEndDate } : {}),
    }
  })

  const { data: visits, error: visitsError } = await supabase
    .from('scheduled_visits')
    .insert(rows)
    .select(visitSelect)

  if (visitsError) return { data: null, error: visitsError }
  const inserted = (visits ?? []) as ScheduledVisitDbRowWithTasks[]
  await replaceVisitTasksForMany(
    supabase,
    agency.agency_id,
    inserted.map((v) => v.id),
    data.adl_codes
  )
  const codes = (data.adl_codes ?? []).filter(Boolean)
  return { data: inserted.map((v) => toScheduleRow(v, codes)), error: null }
}

/** Update a visit by id. */
export async function updateSchedule(
  supabase: Supabase,
  id: string,
  data: {
    date?: string
    start_time?: string | null
    end_time?: string | null
    description?: string | null
    type?: string | null
    caregiver_id?: string | null
    contract_id?: string | null
    service_type?: string | null
    notes?: string | null
    adl_codes?: string[]
    is_recurring?: boolean
    repeat_frequency?: string | null
    days_of_week?: number[] | null
    repeat_monthly_rules?: { ordinal: number; weekday: number }[] | null
    repeat_start?: string | null
    repeat_end?: string | null
    status?: string | null
    end_date?: string | null
  }
) {
  const { data: existing, error: fetchErr } = await supabase
    .from('scheduled_visits')
    .select('id, agency_id, patient_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) return { data: null, error: fetchErr }
  if (!existing) return { data: null, error: { message: 'Visit not found or not accessible.' } }

  const ex = existing as { id: string; agency_id: string; patient_id: string }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.date !== undefined || data.start_time !== undefined || data.end_time !== undefined) {
    const { data: currentRow, error: currentErr } = await supabase
      .from('scheduled_visits')
      .select('visit_date, scheduled_start_time, scheduled_end_time')
      .eq('id', id)
      .maybeSingle()
    if (currentErr) return { data: null, error: currentErr }
    if (!currentRow) return { data: null, error: { message: 'Visit not found or not accessible.' } }

    const localCurrent = toLocalVisitParts(
      String((currentRow as { visit_date: string }).visit_date),
      ((currentRow as { scheduled_start_time?: string | null }).scheduled_start_time ?? null),
      ((currentRow as { scheduled_end_time?: string | null }).scheduled_end_time ?? null)
    )
    const localDate = data.date ?? localCurrent.visitDateLocal
    const localStart = data.start_time !== undefined ? data.start_time : localCurrent.startTimeLocal
    const localEnd = data.end_time !== undefined ? data.end_time : localCurrent.endTimeLocal
    const utcParts = toUtcVisitParts(localDate, localStart ?? null, localEnd ?? null)
    patch.visit_date = utcParts.visitDateUtc
    patch.scheduled_start_time = utcParts.startTimeUtc
    patch.scheduled_end_time = utcParts.endTimeUtc
  }
  if (data.description !== undefined) patch.description = data.description
  if (data.type !== undefined) patch.visit_type = data.type
  if (data.caregiver_id !== undefined) patch.caregiver_member_id = data.caregiver_id
  if (data.contract_id !== undefined) patch.contract_id = data.contract_id
  if (data.service_type !== undefined) patch.service_type = data.service_type
  if (data.notes !== undefined) patch.notes = data.notes
  if (data.is_recurring !== undefined) patch.is_recurring = data.is_recurring
  if (data.status !== undefined) {
    patch.status = data.status === null || data.status === '' ? 'scheduled' : data.status
  }
  if (data.end_date !== undefined) {
    patch.scheduled_end_date = (data.end_date && data.date && data.end_date > data.date) ? data.end_date : null
  }

  const { data: visit, error } = await supabase
    .from('scheduled_visits')
    .update(patch)
    .eq('id', id)
    .select(visitSelectWithTasks)
    .maybeSingle()

  if (error) return { data: null, error }
  if (!visit) {
    return {
      data: null,
      error: { message: 'Visit could not be updated. It may not exist or you may not have permission.' },
    }
  }
  const v = visit as unknown as ScheduledVisitDbRowWithTasks

  if (data.adl_codes !== undefined) {
    await replaceVisitTasks(supabase, ex.agency_id, id, data.adl_codes)
    return { data: toScheduleRow(v as ScheduledVisitDbRow, data.adl_codes.filter(Boolean)), error: null }
  }

  return { data: mapVisitsToScheduleRows([v])[0] ?? null, error: null }
}

export type RecurringUpdateScope =
  | 'this_visit'
  | 'this_and_future'
  | 'all_in_series'
  | 'weekday_in_series'

/**
 * Bulk-update recurring scheduled_visits that belong to the same visit_series as a seed visit.
 * Uses local-date semantics for scope filters to match UI date pickers.
 */
export async function updateRecurringSchedulesByScope(
  supabase: Supabase,
  data: {
    seed_schedule_id: string
    scope: RecurringUpdateScope
    apply_from_date?: string | null
    patch: Parameters<typeof updateSchedule>[2]
  }
): Promise<{ updated_ids: string[]; error: { message: string } | null }> {
  const { data: seed, error: seedErr } = await supabase
    .from('scheduled_visits')
    .select('id, visit_series_id, visit_date, scheduled_start_time, scheduled_end_time')
    .eq('id', data.seed_schedule_id)
    .single()
  if (seedErr || !seed) return { updated_ids: [], error: { message: seedErr?.message || 'Seed visit not found.' } }

  const seedSeriesId = (seed as { visit_series_id?: string | null }).visit_series_id ?? null
  if (!seedSeriesId || data.scope === 'this_visit') {
    const one = await updateSchedule(supabase, data.seed_schedule_id, data.patch)
    if (one.error) return { updated_ids: [], error: { message: one.error.message || 'Failed to update visit.' } }
    return { updated_ids: [data.seed_schedule_id], error: null }
  }

  const seedLocal = toLocalVisitParts(
    String((seed as { visit_date: string }).visit_date),
    (seed as { scheduled_start_time?: string | null }).scheduled_start_time ?? null,
    (seed as { scheduled_end_time?: string | null }).scheduled_end_time ?? null
  )
  const fromDate = data.apply_from_date?.trim() || seedLocal.visitDateLocal
  const seedWeekday = new Date(`${seedLocal.visitDateLocal}T12:00:00`).getDay()

  const { data: rows, error: rowsErr } = await supabase
    .from('scheduled_visits')
    .select('id, visit_date, scheduled_start_time, scheduled_end_time')
    .eq('visit_series_id', seedSeriesId)
  if (rowsErr) return { updated_ids: [], error: { message: rowsErr.message || 'Failed to load recurring visits.' } }

  const ids = (rows ?? [])
    .filter((r) => {
      const local = toLocalVisitParts(
        String((r as { visit_date: string }).visit_date),
        (r as { scheduled_start_time?: string | null }).scheduled_start_time ?? null,
        (r as { scheduled_end_time?: string | null }).scheduled_end_time ?? null
      )
      if (data.scope === 'all_in_series') return true
      if (data.scope === 'this_and_future') return local.visitDateLocal >= fromDate
      if (data.scope === 'weekday_in_series') {
        const wd = new Date(`${local.visitDateLocal}T12:00:00`).getDay()
        return wd === seedWeekday
      }
      return String((r as { id: string }).id) === data.seed_schedule_id
    })
    .map((r) => String((r as { id: string }).id))

  if (ids.length === 0) return { updated_ids: [], error: null }

  const updated: string[] = []
  for (const id of ids) {
    const res = await updateSchedule(supabase, id, data.patch)
    if (res.error) {
      return {
        updated_ids: updated,
        error: { message: res.error.message || `Failed while updating recurring visits (id=${id}).` },
      }
    }
    updated.push(id)
  }
  return { updated_ids: updated, error: null }
}

/** Delete a visit by id (cascade removes scheduled_visit_tasks). */
export async function deleteSchedule(supabase: Supabase, id: string) {
  return supabase.from('scheduled_visits').delete().eq('id', id)
}
