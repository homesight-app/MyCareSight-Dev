/** Pure calculation helpers for payroll and billing report. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function toHHMM(t: string | null | undefined): string {
  if (!t) return '--:--'
  return String(t).slice(0, 5)
}

export function hoursFromSchedule(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0
  const toMinutes = (raw: string) => {
    const s = String(raw).trim()
    const parts = s.split(':').map((x) => parseInt(x, 10))
    const h = parts[0]
    const m = parts[1]
    if (!Number.isFinite(h)) return NaN
    return h * 60 + (Number.isFinite(m) ? m : 0)
  }
  const a = toMinutes(start)
  const b = toMinutes(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return round2((b - a) / 60)
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
