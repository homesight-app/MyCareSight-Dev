import { suggestedVisitTaskTokens, visitOverlappingTaskSlots } from '@/lib/visit-task-prefill'

const day = (overrides: Record<string, string | number | null> = {}) => ({
  schedule_type: 'specific_times' as const,
  times_per_day: 1,
  slot_morning: null,
  slot_afternoon: null,
  slot_evening: null,
  slot_night: null,
  ...overrides,
})

describe('visit task preselection', () => {
  it('uses half-open time windows, including visits that cross noon or midnight', () => {
    expect([...visitOverlappingTaskSlots('09:00', '11:00')]).toEqual(['morning'])
    expect([...visitOverlappingTaskSlots('11:00', '13:00')]).toEqual(['morning', 'afternoon'])
    expect([...visitOverlappingTaskSlots('12:00', '13:00')]).toEqual(['afternoon'])
    expect([...visitOverlappingTaskSlots('21:00', '02:00')]).toEqual(['evening', 'night'])
  })

  it('selects unassigned scheduled slots and Anytime, excluding As Needed', () => {
    const tasks = [
      { code: 'Dressing', schedule: day({ slot_morning: 'always' }) },
      { code: 'Feeding', schedule: day({ slot_morning: 'always', slot_afternoon: 'always' }) },
      { code: 'Bathing', schedule: day({ slot_morning: 'as_needed' }) },
      { code: 'Companionship', schedule: { ...day(), schedule_type: 'always' as const, times_per_day: 2 } },
      { code: 'Shopping', schedule: { ...day(), schedule_type: 'as_needed' as const } },
    ]
    expect(suggestedVisitTaskTokens(tasks, '09:00', '11:00', new Set(['morning::Feeding']))).toEqual([
      'morning::Dressing', 'any::Companionship::2',
    ])
    expect(suggestedVisitTaskTokens(tasks, '11:00', '13:00', new Set(['any::Companionship']))).toEqual([
      'morning::Dressing', 'morning::Feeding', 'afternoon::Feeding',
    ])
  })
})
