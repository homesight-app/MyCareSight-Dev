import { formatDate, formatDateShort } from '@/lib/format-date'

describe('formatDate', () => {
  it('formats a date-only string as local midnight — not UTC', () => {
    // The critical regression: bare "YYYY-MM-DD" must NOT shift to the previous
    // calendar day in timezones west of UTC (the bug we fixed).
    const result = formatDate('2026-12-25')
    // Should always show December 25, regardless of timezone offset
    expect(result).toContain('12/25/2026')
  })

  it('formats a full ISO datetime string', () => {
    const result = formatDate('2026-06-15T10:00:00')
    expect(result).toContain('06/15/2026')
  })

  it('returns N/A for null', () => {
    expect(formatDate(null)).toBe('N/A')
  })

  it('returns N/A for undefined', () => {
    expect(formatDate(undefined)).toBe('N/A')
  })

  it('accepts a Date object', () => {
    const d = new Date(2026, 0, 5) // Jan 5 2026 local time
    const result = formatDate(d)
    expect(result).toContain('01/05/2026')
  })

  it('accepts custom Intl options', () => {
    const result = formatDate('2026-03-07', { year: 'numeric', month: 'long' })
    expect(result).toContain('March')
    expect(result).toContain('2026')
  })
})

describe('formatDateShort', () => {
  it('returns month-short format like "Dec 25, 2026"', () => {
    const result = formatDateShort('2026-12-25')
    expect(result).toContain('Dec')
    expect(result).toContain('25')
    expect(result).toContain('2026')
  })

  it('returns N/A for null', () => {
    expect(formatDateShort(null)).toBe('N/A')
  })
})
