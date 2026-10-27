import { formatVisitTime, formatVisitTimeRange, formatVisitTimeRangeLabel } from '@/lib/visit-time-display'

describe('visit time display', () => {
  it('formats stored wall-clock times in 12-hour time', () => {
    expect(formatVisitTime('00:00:00')).toBe('12:00 AM')
    expect(formatVisitTime('12:00')).toBe('12:00 PM')
    expect(formatVisitTime('17:00')).toBe('5:00 PM')
    expect(formatVisitTime('18:30:00')).toBe('6:30 PM')
  })

  it('keeps the range compact when both ends share AM or PM', () => {
    expect(formatVisitTimeRange('17:00', '18:30')).toBe('5:00–6:30 PM')
    expect(formatVisitTimeRange('09:00', '11:00')).toBe('9:00–11:00 AM')
    expect(formatVisitTimeRange('11:00', '13:00')).toBe('11:00 AM–1:00 PM')
    expect(formatVisitTimeRangeLabel('17:00 - 18:30')).toBe('5:00–6:30 PM')
    expect(formatVisitTimeRangeLabel('17:00–18:30')).toBe('5:00–6:30 PM')
  })

  it('handles absent or invalid times without showing a misleading hour', () => {
    expect(formatVisitTimeRange(null, null)).toBe('Time not set')
    expect(formatVisitTime('25:00')).toBe('')
  })
})
