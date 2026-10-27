/** Format a stored wall-clock visit time without changing its timezone or date. */
export function formatVisitTime(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value?.trim() ?? '')
  if (!match) return ''
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return ''
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`
}

export function formatVisitTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const first = formatVisitTime(start)
  const last = formatVisitTime(end)
  if (!first || !last) return first || last || 'Time not set'
  const firstPeriod = first.slice(-2)
  const lastPeriod = last.slice(-2)
  return firstPeriod === lastPeriod
    ? `${first.slice(0, -3)}–${last}`
    : `${first}–${last}`
}

/** Convert a prebuilt 24-hour visit label for display; keep its raw value for sorting. */
export function formatVisitTimeRangeLabel(value: string | null | undefined): string {
  const raw = value?.trim() ?? ''
  const match = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?)$/.exec(raw)
  return match ? formatVisitTimeRange(match[1], match[2]) : raw || 'Time not set'
}
