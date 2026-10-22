import { allCarePlanDaysEnabled, toggleCarePlanWeek } from '@/lib/care-plan-days'

type Day = { day_of_week: number; schedule_type: string; times_per_day: number | null; note: string | null }

const makeDay = (day: number, existing: Day | undefined, enabled: boolean): Day => ({
  day_of_week: day,
  schedule_type: enabled ? 'always' : 'never',
  times_per_day: enabled ? 1 : null,
  note: existing?.note ?? null,
})

describe('care-plan All control', () => {
  it('fills missing days with Anytime 1x while preserving customized days', () => {
    const existing: Day[] = [
      { day_of_week: 3, schedule_type: 'specific_times', times_per_day: 2, note: 'synthetic note' },
      { day_of_week: 5, schedule_type: 'never', times_per_day: null, note: 'synthetic note' },
    ]
    const next = toggleCarePlanWeek(existing, makeDay)
    expect(next).toHaveLength(7)
    expect(next[2]).toBe(existing[0])
    expect(next[4]).toEqual({ day_of_week: 5, schedule_type: 'always', times_per_day: 1, note: 'synthetic note' })
    expect(allCarePlanDaysEnabled(next)).toBe(true)
  })

  it('turns a fully enabled week off and retains notes', () => {
    const enabled = toggleCarePlanWeek([], makeDay)
    const disabled = toggleCarePlanWeek(enabled, makeDay)
    expect(disabled.every((day) => day.schedule_type === 'never')).toBe(true)
    expect(allCarePlanDaysEnabled(disabled)).toBe(false)
  })
})
