/** Pure calculation helpers for payroll and billing report. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function toHHMM(t: string | null | undefined): string {
  if (!t) return '--:--'
  return String(t).slice(0, 5)
}

function toMinutes(raw: string): number {
  const s = String(raw).trim()
  const parts = s.split(':').map((x) => parseInt(x, 10))
  const h = parts[0]
  const m = parts[1]
  if (!Number.isFinite(h)) return NaN
  return h * 60 + (Number.isFinite(m) ? m : 0)
}

/** Returns calendar days between two YYYY-MM-DD strings (0 if same day). */
export function countDaysBetween(a: string, b: string): number {
  return Math.max(0, Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000
  ))
}

export function hoursFromSchedule(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0
  const a = toMinutes(start)
  const b = toMinutes(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return round2((b - a) / 60)
}

/**
 * Total hours for a visit, supporting multi-day spans.
 * Formula: dayDiff × 24h + (endTime − startTime).
 * Falls back to same-day calculation when dates are absent or equal.
 */
export function hoursFromScheduleWithDates(
  startDate: string | null | undefined,
  startTime: string | null | undefined,
  endDate: string | null | undefined,
  endTime: string | null | undefined,
): number {
  if (!startTime || !endTime) return 0
  const effectiveEnd = endDate || startDate
  const dayDiff = (startDate && effectiveEnd) ? countDaysBetween(startDate, effectiveEnd) : 0
  const a = toMinutes(startTime)
  const b = toMinutes(endTime)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return round2(Math.max(0, dayDiff * 24 * 60 + (b - a)) / 60)
}

/**
 * For a multi-day visit, splits total hours at work-week boundaries and returns
 * per-week totals. Single-day visits return a single-element array.
 */
export function splitHoursByWeek(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  caregiverId: string,
  weekStart: number,
): Array<{ weekKey: string; hours: number }> {
  const startDt = new Date(`${startDate}T${startTime.slice(0, 5)}:00`)
  const endDt   = new Date(`${endDate}T${endTime.slice(0, 5)}:00`)
  if (endDt <= startDt) {
    return [{ weekKey: getWeekKey(caregiverId, startDate, weekStart), hours: 0 }]
  }

  const segments: Array<{ weekKey: string; hours: number }> = []
  let cursor = new Date(startDt)
  while (cursor < endDt) {
    const dow = cursor.getDay()
    const daysToWeekEnd = ((weekStart - dow + 7) % 7) || 7
    const boundary = new Date(cursor)
    boundary.setDate(cursor.getDate() + daysToWeekEnd)
    boundary.setHours(0, 0, 0, 0)
    const segEnd = boundary < endDt ? boundary : endDt
    segments.push({
      weekKey: getWeekKey(caregiverId, cursor.toISOString().slice(0, 10), weekStart),
      hours: round2((segEnd.getTime() - cursor.getTime()) / 3_600_000),
    })
    cursor = new Date(boundary)
  }
  return segments
}

export function calcAmount(hours: number, rate: number, unit: string | null | undefined): number {
  if (!Number.isFinite(hours) || !Number.isFinite(rate)) return 0
  if (unit === 'visit') return rate
  if (unit === '15_min_unit') return rate * Math.round(hours * 4)
  return rate * hours
}

export function serviceTypeLabelFn(serviceType: string, visitType: string | null | undefined): string {
  const vt = visitType?.trim()
  if (vt) return vt
  return serviceType === 'skilled' ? 'Skilled' : 'HHA/CNA'
}

/**
 * Returns a composite key: `caregiverId__YYYY-MM-DD` where the date is the
 * start of the caregiver's work week containing visitDate.
 * weekStart: 0=Sun, 1=Mon, … 6=Sat
 */
export function getWeekKey(caregiverId: string, visitDate: string, weekStart: number): string {
  const d = new Date(visitDate + 'T12:00:00')
  const dow = d.getDay() // 0=Sun
  const daysBack = (dow - weekStart + 7) % 7
  const weekStartDate = new Date(d)
  weekStartDate.setDate(d.getDate() - daysBack)
  return `${caregiverId}__${weekStartDate.toISOString().slice(0, 10)}`
}
