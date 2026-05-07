/**
 * Formats a date for display in the user's local timezone.
 *
 * Date-only strings (YYYY-MM-DD) are intentionally parsed as local midnight,
 * NOT UTC midnight. JS parses bare date strings as UTC by spec, which shifts
 * them to the previous calendar day for any timezone west of GMT — causing
 * an off-by-one-day display bug.
 */
export function formatDate(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', year: 'numeric' }
): string {
  if (!date) return 'N/A'
  let d: Date
  if (typeof date === 'string') {
    d = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(date + 'T00:00:00')   // local midnight, not UTC
      : new Date(date)                  // full ISO timestamp — timezone already encoded
  } else {
    d = date
  }
  return d.toLocaleDateString('en-US', options)
}

/** Shorthand for the common month-short format: "May 6, 2026" */
export function formatDateShort(date: string | Date | null | undefined): string {
  return formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' })
}
