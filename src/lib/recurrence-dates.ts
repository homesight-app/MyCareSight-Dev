/**
 * Expand recurring visit patterns into YYYY-MM-DD strings (Gregorian civil dates).
 * Uses UTC for calendar arithmetic so results match across browser, Node, and Deno.
 *
 * Weekday convention for `days_of_week`: 0 = Sunday … 6 = Saturday (same as Date.getUTCDay()).
 *
 * Edge copy is inlined in `supabase/functions/refill-visit-series/index.ts` (single-file deploy).
 */

export function toYmdFromUtcDate(d: Date): string {
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Anchor a new recurring series to the visit date selected by the scheduler. */
export function recurrenceDateDefaults(visitDate: string, frequency: 'daily' | 'weekly') {
  return {
    repeatStart: visitDate,
    repeatEnd: frequency === 'daily' ? visitDate : '',
  }
}

function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function datesBetween(startStr: string, endStr: string): string[] {
  const out: string[] = []
  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const cur = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0))
  const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0))
  while (cur <= end && out.length < 10000) {
    out.push(toYmdFromUtcDate(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export function datesWeeklyBetween(startStr: string, endStr: string, daysOfWeek: number[]): string[] {
  const set = new Set(daysOfWeek.map((n) => Math.min(6, Math.max(0, Math.floor(n)))))
  return datesBetween(startStr, endStr).filter((dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    return set.has(dt.getUTCDay())
  })
}

export function getOrdinalWeekdayInMonth(
  year: number,
  month: number,
  ordinal: 1 | 2 | 3 | 4 | 5,
  weekday: number
): string | null {
  const wd = Math.min(6, Math.max(0, weekday))
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const sameWeekdayDates: number[] = []
  for (let date = 1; date <= lastDay; date++) {
    if (new Date(Date.UTC(year, month, date, 12, 0, 0)).getUTCDay() === wd) {
      sameWeekdayDates.push(date)
    }
  }
  if (sameWeekdayDates.length === 0) return null
  const index = ordinal === 5 ? sameWeekdayDates.length - 1 : Math.min(ordinal - 1, sameWeekdayDates.length - 1)
  const day = sameWeekdayDates[index]
  return formatYmd(year, month + 1, day)
}

export function getAllWeekdayDatesInMonth(year: number, month: number, weekday: number): string[] {
  const wd = Math.min(6, Math.max(0, weekday))
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const out: string[] = []
  for (let date = 1; date <= lastDay; date++) {
    if (new Date(Date.UTC(year, month, date, 12, 0, 0)).getUTCDay() === wd) {
      out.push(formatYmd(year, month + 1, date))
    }
  }
  return out
}

export function datesMonthlyBetween(
  startStr: string,
  endStr: string,
  ordinal: number,
  weekday: number
): string[] {
  const out: string[] = []
  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const start = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0))
  const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0))
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()
  const wd = Math.min(6, Math.max(0, weekday))
  while (out.length < 500) {
    if (ordinal === 0) {
      for (const dateStr of getAllWeekdayDatesInMonth(y, m, wd)) {
        const d = new Date(dateStr + 'T12:00:00Z')
        if (d >= start && d <= end) out.push(dateStr)
      }
    } else {
      const ord = Math.min(5, Math.max(1, ordinal)) as 1 | 2 | 3 | 4 | 5
      const dateStr = getOrdinalWeekdayInMonth(y, m, ord, wd)
      if (dateStr) {
        const d = new Date(dateStr + 'T12:00:00Z')
        if (d >= start && d <= end) out.push(dateStr)
      }
    }
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
    if (y > end.getUTCFullYear() || (y === end.getUTCFullYear() && m > end.getUTCMonth())) break
  }
  return out
}

export function datesMonthlyBetweenFromRules(
  startStr: string,
  endStr: string,
  rules: { ordinal: number; weekday: number }[]
): string[] {
  const set = new Set<string>()
  for (const r of rules) {
    const ord = r.ordinal
    const wd = Math.min(6, Math.max(0, r.weekday))
    for (const d of datesMonthlyBetween(startStr, endStr, ord, wd)) set.add(d)
  }
  return Array.from(set).sort()
}

export type ExpandSeriesOccurrencesParams = {
  repeat_frequency: string | null
  repeat_start: string
  repeat_end: string | null
  days_of_week: number[] | null
  repeat_monthly_rules: { ordinal: number; weekday: number }[] | null
  /** Pacific “today” (rolling window start). */
  rangeStart: string
  /** Pacific today + 20 (rolling window end). */
  rangeEnd: string
}

/** `initial`: Add Visit — open-ended uses 21-day window; fixed end uses full start→end (no horizon cap). `refill`: Edge job — always clip to rolling window. */
export type ExpandSeriesOccurrencesMode = 'initial' | 'refill'

function hasSeriesFixedEnd(repeatEnd: string | null | undefined): repeatEnd is string {
  return repeatEnd != null && String(repeatEnd).trim() !== ''
}

/** Strip time from timestamptz / ISO strings so YYYY-MM-DD lexicographic compare matches calendar order. */
export function normalizeYmdInput(s: string | null | undefined): string | null {
  if (s == null) return null
  const t = String(s).trim()
  if (!t) return null
  const d = t.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/**
 * Materialize occurrence dates. Start is never before Pacific `rangeStart` (today on that run).
 */
export function expandSeriesOccurrences(
  p: ExpandSeriesOccurrencesParams,
  mode: ExpandSeriesOccurrencesMode = 'initial'
): string[] {
  const horizonStart = normalizeYmdInput(p.rangeStart) ?? p.rangeStart
  const horizonEnd = normalizeYmdInput(p.rangeEnd) ?? p.rangeEnd
  const repeatStartNorm = normalizeYmdInput(p.repeat_start) ?? p.repeat_start
  const repeatEndNorm = normalizeYmdInput(p.repeat_end)
  const fixedEnd = hasSeriesFixedEnd(repeatEndNorm) ? repeatEndNorm : null

  const capStart = repeatStartNorm > horizonStart ? repeatStartNorm : horizonStart

  let capEnd: string
  if (mode === 'refill') {
    capEnd = fixedEnd != null ? (fixedEnd < horizonEnd ? fixedEnd : horizonEnd) : horizonEnd
  } else {
    capEnd = fixedEnd != null ? fixedEnd : horizonEnd
  }

  if (capStart > capEnd) return []

  const freq = (p.repeat_frequency ?? '').trim().toLowerCase()
  switch (freq) {
    case 'daily':
      return datesBetween(capStart, capEnd)
    case 'weekly': {
      const days = p.days_of_week?.length ? p.days_of_week : []
      if (days.length === 0) return []
      return datesWeeklyBetween(capStart, capEnd, days)
    }
    case 'monthly': {
      const rules = p.repeat_monthly_rules?.filter(
        (r) => r.ordinal != null && r.weekday != null
      ) as { ordinal: number; weekday: number }[]
      if (!rules?.length) return []
      return datesMonthlyBetweenFromRules(capStart, capEnd, rules)
    }
    default:
      return []
  }
}
