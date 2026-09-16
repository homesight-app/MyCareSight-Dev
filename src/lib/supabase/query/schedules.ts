import sql from '@/db'

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
  status_reason?: string | null
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
  patient_address?: PatientAddressNested | null
  end_date?: string | null
}

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
  scheduled_end_date?: string | null
  description: string | null
  notes: string | null
  status_reason?: string | null
  visit_type: string | null
  status: string
  is_recurring: boolean
  created_at: string
  updated_at: string
  patient_address_id?: string | null
  mileage_miles?: number | null
  patient_address?: PatientAddressNested | PatientAddressNested[] | null
}

type PatientAddressNested = { id: string; zip_code: string; street_address: string; city: string; state: string; label: string }

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
    status_reason: v.status_reason ?? null,
    is_recurring: v.is_recurring,
    repeat_frequency: series?.repeat_frequency ?? null,
    days_of_week: series?.days_of_week ?? null,
    repeat_monthly_rules: parseMonthlyRules(series?.repeat_monthly_rules),
    repeat_start: series?.repeat_start ?? null,
    repeat_end: series?.repeat_end ?? null,
    status: v.status,
    created_at: v.created_at,
    updated_at: v.updated_at,
    patient_address_id: v.patient_address_id ?? null,
    mileage_miles: v.mileage_miles ?? null,
    patient_address: firstRel(v.patient_address) ?? null,
    end_date: v.scheduled_end_date ?? null,
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

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

/**
 * Inline visit SELECT fragment expressed as a SQL template that postgres.js can
 * embed via `${visitCols}`.  We keep a single definition so every query selects
 * exactly the same columns.
 */
const visitCols = sql`
  sv.id,
  sv.agency_id,
  sv.patient_id,
  sv.caregiver_member_id,
  sv.contract_id,
  sv.service_type,
  sv.visit_date,
  sv.scheduled_start_time,
  sv.scheduled_end_time,
  sv.description,
  sv.notes,
  sv.status_reason,
  sv.visit_type,
  sv.status,
  sv.is_recurring,
  sv.created_at,
  sv.updated_at,
  sv.patient_address_id,
  sv.mileage_miles,
  sv.scheduled_end_date,
  CASE WHEN pa.id IS NOT NULL
    THEN json_build_object(
      'id', pa.id,
      'zip_code', pa.zip_code,
      'street_address', pa.street_address,
      'city', pa.city,
      'state', pa.state,
      'label', pa.label
    )
    ELSE NULL
  END AS patient_address
`

/** Columns + tasks + series (used by read queries). */
const visitColsWithTasks = sql`
  ${visitCols},
  COALESCE(
    json_agg(
      json_build_object('legacy_task_code', svt.legacy_task_code, 'sort_order', svt.sort_order)
    ) FILTER (WHERE svt.id IS NOT NULL),
    '[]'
  ) AS scheduled_visit_tasks,
  (
    SELECT json_build_object(
      'repeat_frequency', vs.repeat_frequency,
      'days_of_week', vs.days_of_week,
      'repeat_start', vs.repeat_start,
      'repeat_end', vs.repeat_end,
      'repeat_monthly_rules', vs.repeat_monthly_rules
    )
    FROM visit_series vs
    WHERE vs.id = sv.visit_series_id
    LIMIT 1
  ) AS visit_series
`

async function requirePatientAgencyId(
  patientId: string
): Promise<{ agency_id: string } | { error: { message: string } }> {
  const rows = await sql`SELECT agency_id FROM patients WHERE id = ${patientId} LIMIT 1`
  const agencyId = (rows[0]?.agency_id as string | null | undefined) ?? null
  if (!agencyId) {
    return { error: { message: 'Patient must belong to an agency before scheduling visits.' } }
  }
  return { agency_id: agencyId }
}

async function replaceVisitTasks(
  agencyId: string,
  visitId: string,
  adlCodes: string[] | undefined
): Promise<void> {
  await sql`DELETE FROM scheduled_visit_tasks WHERE scheduled_visit_id = ${visitId}`
  const codes = adlCodes ?? []
  if (codes.length === 0) return
  const rows = codes.map((code, i) => ({
    agency_id: agencyId,
    scheduled_visit_id: visitId,
    task_id: null as string | null,
    legacy_task_code: code,
    sort_order: i,
  }))
  await sql`INSERT INTO scheduled_visit_tasks ${sql(rows)}`
}

async function replaceVisitTasksForMany(
  agencyId: string,
  visitIds: string[],
  adlCodes: string[] | undefined
): Promise<void> {
  if (visitIds.length === 0) return
  await sql`DELETE FROM scheduled_visit_tasks WHERE scheduled_visit_id = ANY(${visitIds})`
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
  await sql`INSERT INTO scheduled_visit_tasks ${sql(rows)}`
}

// ---------------------------------------------------------------------------
// Public read queries
// ---------------------------------------------------------------------------

/** Get all visits for a patient as unknown as ScheduleRow[]. */
export async function getSchedulesByPatientId(
  patientId: string
): Promise<{ data: ScheduleRow[] | null; error: Error | null }> {
  try {
    const rows = await sql`
      SELECT ${visitColsWithTasks}
      FROM scheduled_visits sv
      LEFT JOIN patient_addresses pa ON pa.id = sv.patient_address_id
      LEFT JOIN scheduled_visit_tasks svt ON svt.scheduled_visit_id = sv.id
      WHERE sv.patient_id = ${patientId}
      GROUP BY sv.id, pa.id
      ORDER BY sv.visit_date ASC, sv.scheduled_start_time ASC
    `
    return { data: mapVisitsToScheduleRows(rows as unknown as ScheduledVisitDbRowWithTasks[]), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Visits for a patient in an inclusive date range. */
export async function getSchedulesByPatientIdAndDateRange(
  patientId: string,
  startDate: string,
  endDate: string
): Promise<{ data: ScheduleRow[] | null; error: Error | null }> {
  try {
    const rows = await sql`
      SELECT ${visitColsWithTasks}
      FROM scheduled_visits sv
      LEFT JOIN patient_addresses pa ON pa.id = sv.patient_address_id
      LEFT JOIN scheduled_visit_tasks svt ON svt.scheduled_visit_id = sv.id
      WHERE sv.patient_id = ${patientId}
        AND sv.visit_date >= ${startDate}
        AND sv.visit_date <= ${endDate}
      GROUP BY sv.id, pa.id
      ORDER BY sv.visit_date ASC, sv.scheduled_start_time ASC
    `
    return { data: mapVisitsToScheduleRows(rows as unknown as ScheduledVisitDbRowWithTasks[]), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/**
 * Cross-tenant scheduled visits (e.g. admin all-visits dashboard), newest `visit_date` first.
 * When `startDate`/`endDate` are omitted, uses {@link getDefaultScheduledVisitBulkDateRange} so the query stays bounded as data grows.
 */
export async function getAllScheduledVisitsAsScheduleRows(
  options?: { startDate?: string; endDate?: string }
): Promise<{ data: ScheduleRow[] | null; error: Error | null }> {
  const { startDate, endDate } =
    options?.startDate != null && options?.endDate != null
      ? { startDate: options.startDate, endDate: options.endDate }
      : getDefaultScheduledVisitBulkDateRange()
  try {
    const rows = await sql`
      SELECT ${visitColsWithTasks}
      FROM scheduled_visits sv
      LEFT JOIN patient_addresses pa ON pa.id = sv.patient_address_id
      LEFT JOIN scheduled_visit_tasks svt ON svt.scheduled_visit_id = sv.id
      WHERE sv.visit_date >= ${startDate}
        AND sv.visit_date <= ${endDate}
      GROUP BY sv.id, pa.id
      ORDER BY sv.visit_date DESC, sv.scheduled_start_time ASC
    `
    return { data: mapVisitsToScheduleRows(rows as unknown as ScheduledVisitDbRowWithTasks[]), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Visits for one agency in an inclusive date range (for overlap checks in scheduling UI). */
export async function getScheduledVisitsAsScheduleRowsForAgencyAndDateRange(
  agencyId: string,
  startDate: string,
  endDate: string
): Promise<{ data: ScheduleRow[] | null; error: Error | null }> {
  try {
    const rows = await sql`
      SELECT ${visitColsWithTasks}
      FROM scheduled_visits sv
      LEFT JOIN patient_addresses pa ON pa.id = sv.patient_address_id
      LEFT JOIN scheduled_visit_tasks svt ON svt.scheduled_visit_id = sv.id
      WHERE sv.agency_id = ${agencyId}
        AND sv.visit_date >= ${startDate}
        AND sv.visit_date <= ${endDate}
      GROUP BY sv.id, pa.id
      ORDER BY sv.visit_date ASC, sv.scheduled_start_time ASC
    `
    return { data: mapVisitsToScheduleRows(rows as unknown as ScheduledVisitDbRowWithTasks[]), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Visits by primary key (e.g. assignment requests referencing schedule_id = visit id). */
export async function getScheduledVisitsByIdsAsScheduleRows(
  ids: string[]
): Promise<{ data: ScheduleRow[] | null; error: Error | null }> {
  const clean = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0 && id !== 'null')))
  if (clean.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT ${visitColsWithTasks}
      FROM scheduled_visits sv
      LEFT JOIN patient_addresses pa ON pa.id = sv.patient_address_id
      LEFT JOIN scheduled_visit_tasks svt ON svt.scheduled_visit_id = sv.id
      WHERE sv.id = ANY(${clean})
      GROUP BY sv.id, pa.id
    `
    return { data: mapVisitsToScheduleRows(rows as unknown as ScheduledVisitDbRowWithTasks[]), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

// ---------------------------------------------------------------------------
// Public write queries
// ---------------------------------------------------------------------------

/** Insert a visit and return the row as ScheduleRow. */
export async function insertSchedule(
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
): Promise<{ data: ScheduleRow | null; error: { message: string } | Error | null }> {
  try {
    const agency = await requirePatientAgencyId(data.patient_id)
    if ('error' in agency) return { data: null, error: agency.error }

    const utcParts = toUtcVisitParts(data.date, data.start_time ?? null, data.end_time ?? null)
    const scheduledEndDate =
      data.end_date && data.end_date > data.date ? data.end_date : null

    const inserted = await sql`
      INSERT INTO scheduled_visits (
        agency_id, patient_id, caregiver_member_id, contract_id, service_type,
        visit_date, scheduled_start_time, scheduled_end_time,
        description, notes, visit_type, status, is_recurring,
        patient_address_id, mileage_miles, scheduled_end_date
      ) VALUES (
        ${agency.agency_id}, ${data.patient_id}, ${data.caregiver_id ?? null},
        ${data.contract_id ?? null}, ${data.service_type ?? 'non_skilled'},
        ${utcParts.visitDateUtc}, ${utcParts.startTimeUtc}, ${utcParts.endTimeUtc},
        ${data.description ?? null}, ${data.notes ?? null}, ${data.type ?? null},
        'scheduled', ${data.is_recurring ?? false},
        ${data.patient_address_id ?? null}, ${data.mileage_miles ?? null},
        ${scheduledEndDate}
      )
      RETURNING
        id, agency_id, patient_id, caregiver_member_id, contract_id, service_type,
        visit_date, scheduled_start_time, scheduled_end_time, description, notes,
        status_reason, visit_type, status, is_recurring, created_at, updated_at,
        patient_address_id, mileage_miles, scheduled_end_date
    `
    if (!inserted.length) return { data: null, error: new Error('Insert returned no rows') }
    const v = inserted[0] as ScheduledVisitDbRowWithTasks
    await replaceVisitTasks(agency.agency_id, v.id, data.adl_codes)
    const adlCodes = (data.adl_codes ?? []).filter(Boolean)
    return { data: toScheduleRow(v, adlCodes), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Create one visit_series template and many dated scheduled_visits linked to it. */
export async function insertRecurringSchedulesFromSeries(
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
): Promise<{ data: ScheduleRow[] | null; error: { message: string } | Error | null }> {
  if (data.dates.length === 0) return { data: [], error: { message: 'No dates to insert.' } }
  try {
    const agency = await requirePatientAgencyId(data.patient_id)
    if ('error' in agency) return { data: null, error: agency.error }

    const monthly =
      data.repeat_monthly_rules && data.repeat_monthly_rules.length > 0
        ? data.repeat_monthly_rules
        : null

    const endDayOffset = data.end_day_offset ?? 0

    const seriesInserted = await sql`
      INSERT INTO visit_series (
        agency_id, patient_id, primary_caregiver_member_id, contract_id, service_type,
        series_name, repeat_frequency, days_of_week, repeat_start, repeat_end,
        repeat_monthly_rules, notes, status, end_day_offset
      ) VALUES (
        ${agency.agency_id}, ${data.patient_id}, ${data.caregiver_id ?? null},
        ${data.contract_id ?? null}, ${data.service_type ?? 'non_skilled'},
        ${data.type ?? null}, ${data.repeat_frequency ?? null},
        ${data.days_of_week?.length ? data.days_of_week.map(Number) : null},
        ${data.repeat_start}, ${data.repeat_end ?? null},
        ${monthly as unknown as string}, ${data.notes ?? null},
        'active', ${endDayOffset}
      )
      RETURNING id
    `
    if (!seriesInserted.length) return { data: null, error: new Error('Failed to create visit series.') }
    const seriesId = seriesInserted[0].id as string

    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr + 'T12:00:00')
      d.setDate(d.getDate() + days)
      return d.toISOString().slice(0, 10)
    }

    const visitRows = data.dates.map((dateStr) => {
      const utcParts = toUtcVisitParts(dateStr, data.start_time ?? null, data.end_time ?? null)
      const instanceEndDate = endDayOffset > 0 ? addDays(dateStr, endDayOffset) : null
      return {
        agency_id: agency.agency_id,
        visit_series_id: seriesId,
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
        scheduled_end_date: instanceEndDate,
      }
    })

    const inserted = await sql`
      INSERT INTO scheduled_visits ${sql(visitRows)}
      RETURNING
        id, agency_id, patient_id, caregiver_member_id, contract_id, service_type,
        visit_date, scheduled_start_time, scheduled_end_time, description, notes,
        status_reason, visit_type, status, is_recurring, created_at, updated_at,
        patient_address_id, mileage_miles, scheduled_end_date
    `
    const visits = inserted as unknown as ScheduledVisitDbRowWithTasks[]
    await replaceVisitTasksForMany(
      agency.agency_id,
      visits.map((v) => v.id),
      data.adl_codes
    )
    const codes = (data.adl_codes ?? []).filter(Boolean)
    return { data: visits.map((v) => toScheduleRow(v, codes)), error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update a visit by id. */
export async function updateSchedule(
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
    status_reason?: string | null
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
): Promise<{ data: ScheduleRow | null; error: { message: string } | Error | null }> {
  try {
    const existingRows = await sql`
      SELECT id, agency_id, patient_id FROM scheduled_visits WHERE id = ${id} LIMIT 1
    `
    if (!existingRows.length) return { data: null, error: { message: 'Visit not found or not accessible.' } }
    const ex = existingRows[0] as any

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (data.date !== undefined || data.start_time !== undefined || data.end_time !== undefined) {
      const currentRows = await sql`
        SELECT visit_date, scheduled_start_time, scheduled_end_time
        FROM scheduled_visits WHERE id = ${id} LIMIT 1
      `
      if (!currentRows.length) return { data: null, error: { message: 'Visit not found or not accessible.' } }
      const currentRow = currentRows[0] as any

      const localCurrent = toLocalVisitParts(
        String(currentRow.visit_date),
        currentRow.scheduled_start_time ?? null,
        currentRow.scheduled_end_time ?? null
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
    if (data.status_reason !== undefined) patch.status_reason = data.status_reason
    if (data.is_recurring !== undefined) patch.is_recurring = data.is_recurring
    if (data.status !== undefined) {
      patch.status = data.status === null || data.status === '' ? 'scheduled' : data.status
    }
    if (data.end_date !== undefined) {
      patch.scheduled_end_date = (data.end_date && data.date && data.end_date > data.date) ? data.end_date : null
    }

    const updatedRows = await sql`
      UPDATE scheduled_visits
      SET ${sql(patch, ...Object.keys(patch) as [string, ...string[]])}
      WHERE id = ${id}
      RETURNING
        id, agency_id, patient_id, caregiver_member_id, contract_id, service_type,
        visit_date, scheduled_start_time, scheduled_end_time, description, notes,
        status_reason, visit_type, status, is_recurring, created_at, updated_at,
        patient_address_id, mileage_miles, scheduled_end_date
    `
    if (!updatedRows.length) {
      return {
        data: null,
        error: { message: 'Visit could not be updated. It may not exist or you may not have permission.' },
      }
    }
    const v = updatedRows[0] as ScheduledVisitDbRowWithTasks

    if (data.adl_codes !== undefined) {
      await replaceVisitTasks(ex.agency_id, id, data.adl_codes)
      return { data: toScheduleRow(v as ScheduledVisitDbRow, data.adl_codes.filter(Boolean)), error: null }
    }

    // Fetch tasks for mapping
    const taskRows = await sql`
      SELECT legacy_task_code, sort_order FROM scheduled_visit_tasks WHERE scheduled_visit_id = ${id}
    `
    v.scheduled_visit_tasks = taskRows as unknown as ScheduledVisitTaskNested[]
    return { data: mapVisitsToScheduleRows([v])[0] ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
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
  data: {
    seed_schedule_id: string
    scope: RecurringUpdateScope
    apply_from_date?: string | null
    patch: Parameters<typeof updateSchedule>[1]
  }
): Promise<{ updated_ids: string[]; error: { message: string } | null }> {
  try {
    const seedRows = await sql`
      SELECT id, visit_series_id, visit_date, scheduled_start_time, scheduled_end_time
      FROM scheduled_visits WHERE id = ${data.seed_schedule_id} LIMIT 1
    `
    if (!seedRows.length) return { updated_ids: [], error: { message: 'Seed visit not found.' } }
    const seed = seedRows[0] as {
      id: string
      visit_series_id?: string | null
      visit_date: string
      scheduled_start_time?: string | null
      scheduled_end_time?: string | null
    }

    const seedSeriesId = seed.visit_series_id ?? null
    if (!seedSeriesId || data.scope === 'this_visit') {
      const one = await updateSchedule(data.seed_schedule_id, data.patch)
      if (one.error) return { updated_ids: [], error: { message: (one.error as { message?: string }).message || 'Failed to update visit.' } }
      return { updated_ids: [data.seed_schedule_id], error: null }
    }

    const seedLocal = toLocalVisitParts(
      String(seed.visit_date),
      seed.scheduled_start_time ?? null,
      seed.scheduled_end_time ?? null
    )
    const fromDate = data.apply_from_date?.trim() || seedLocal.visitDateLocal
    const seedWeekday = new Date(`${seedLocal.visitDateLocal}T12:00:00`).getDay()

    let seriesRows: Array<{ id: string; visit_date: string; scheduled_start_time?: string | null; scheduled_end_time?: string | null }>
    if (data.scope === 'this_and_future') {
      seriesRows = (await sql`
        SELECT id, visit_date, scheduled_start_time, scheduled_end_time
        FROM scheduled_visits
        WHERE visit_series_id = ${seedSeriesId}
          AND visit_date >= ${fromDate}
      `) as typeof seriesRows
    } else {
      seriesRows = (await sql`
        SELECT id, visit_date, scheduled_start_time, scheduled_end_time
        FROM scheduled_visits
        WHERE visit_series_id = ${seedSeriesId}
      `) as typeof seriesRows
    }

    const ids = seriesRows
      .filter((r) => {
        if (data.scope === 'all_in_series' || data.scope === 'this_and_future') return true
        if (data.scope === 'weekday_in_series') {
          const local = toLocalVisitParts(
            String(r.visit_date),
            r.scheduled_start_time ?? null,
            r.scheduled_end_time ?? null
          )
          return new Date(`${local.visitDateLocal}T12:00:00`).getDay() === seedWeekday
        }
        return String(r.id) === data.seed_schedule_id
      })
      .map((r) => String(r.id))

    if (ids.length === 0) return { updated_ids: [], error: null }

    const updated: string[] = []
    for (const visitId of ids) {
      const res = await updateSchedule(visitId, data.patch)
      if (res.error) {
        return {
          updated_ids: updated,
          error: { message: (res.error as { message?: string }).message || `Failed while updating recurring visits (id=${visitId}).` },
        }
      }
      updated.push(visitId)
    }
    return { updated_ids: updated, error: null }
  } catch (err) {
    return { updated_ids: [], error: { message: (err as Error).message || 'Unexpected error.' } }
  }
}

/** Delete a visit by id (cascade removes scheduled_visit_tasks). */
export async function deleteSchedule(
  id: string
): Promise<{ data: null; error: Error | null }> {
  try {
    await sql`DELETE FROM scheduled_visits WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
