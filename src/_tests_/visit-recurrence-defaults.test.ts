import { expandSeriesOccurrences, recurrenceDateDefaults } from '@/lib/recurrence-dates'

describe('visit recurrence defaults', () => {
  const selectedDate = '2026-11-04' // Wednesday, after the current week

  it('starts a daily series on the selected visit date', () => {
    const defaults = recurrenceDateDefaults(selectedDate, 'daily')
    expect(defaults).toEqual({ repeatStart: selectedDate, repeatEnd: selectedDate })
    expect(expandSeriesOccurrences({
      repeat_frequency: 'daily', repeat_start: defaults.repeatStart,
      repeat_end: defaults.repeatEnd, days_of_week: null, repeat_monthly_rules: null,
      rangeStart: '2026-10-28', rangeEnd: '2026-11-25',
    })).toEqual([selectedDate])
  })

  it('starts a weekly series from the selected date, never the current Monday', () => {
    const defaults = recurrenceDateDefaults(selectedDate, 'weekly')
    expect(defaults).toEqual({ repeatStart: selectedDate, repeatEnd: '' })
    expect(expandSeriesOccurrences({
      repeat_frequency: 'weekly', repeat_start: defaults.repeatStart,
      repeat_end: null, days_of_week: [3], repeat_monthly_rules: null,
      rangeStart: '2026-10-28', rangeEnd: '2026-11-18',
    })).toEqual(['2026-11-04', '2026-11-11', '2026-11-18'])
  })
})
