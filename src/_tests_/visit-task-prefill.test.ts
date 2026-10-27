import { suggestedVisitTaskTokens, visitOverlappingTaskSlots } from '@/lib/visit-task-prefill'
import { VISIT_TASK_TIME_WINDOWS } from '@/lib/visit-task-time-windows'

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
  it('keeps the displayed time windows contiguous across all four boundaries', () => {
    expect(VISIT_TASK_TIME_WINDOWS.map(({ range }) => range)).toEqual([
      '5 AM - 11 AM', '11 AM - 5 PM', '5 PM - 11 PM', '11 PM - 5 AM',
    ])
    expect([...visitOverlappingTaskSlots('04:59', '05:00')]).toEqual(['night'])
    expect([...visitOverlappingTaskSlots('05:00', '05:01')]).toEqual(['morning'])
    expect([...visitOverlappingTaskSlots('10:59', '11:00')]).toEqual(['morning'])
    expect([...visitOverlappingTaskSlots('11:00', '11:01')]).toEqual(['afternoon'])
    expect([...visitOverlappingTaskSlots('16:59', '17:00')]).toEqual(['afternoon'])
    expect([...visitOverlappingTaskSlots('17:00', '17:01')]).toEqual(['evening'])
    expect([...visitOverlappingTaskSlots('22:59', '23:00')]).toEqual(['evening'])
    expect([...visitOverlappingTaskSlots('23:00', '23:01')]).toEqual(['night'])
  })

  it('uses half-open time windows, including visits that cross a boundary or midnight', () => {
    expect([...visitOverlappingTaskSlots('09:00', '11:00')]).toEqual(['morning'])
    expect([...visitOverlappingTaskSlots('10:00', '12:00')]).toEqual(['morning', 'afternoon'])
    expect([...visitOverlappingTaskSlots('11:00', '13:00')]).toEqual(['afternoon'])
    expect([...visitOverlappingTaskSlots('12:00', '13:00')]).toEqual(['afternoon'])
    expect([...visitOverlappingTaskSlots('21:00', '02:00')]).toEqual(['evening', 'night'])
    expect([...visitOverlappingTaskSlots('04:30', '05:30')]).toEqual(['morning', 'night'])
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
      'morning::Dressing', 'any::Companionship::2::1', 'any::Companionship::2::2',
    ])
    expect(suggestedVisitTaskTokens(tasks, '11:00', '13:00', new Set(['any::Companionship']))).toEqual([
      'afternoon::Feeding',
    ])
  })

  it('offers only the remaining occurrence when another visit has one of two Anytime tasks', () => {
    const tasks = [{ code: 'Feeding', schedule: { ...day(), schedule_type: 'always' as const, times_per_day: 2 } }]
    expect(suggestedVisitTaskTokens(tasks, '09:00', '10:00', new Set(['any::Feeding::1']))).toEqual([
      'any::Feeding::2::2',
    ])
    expect(suggestedVisitTaskTokens(tasks, '09:00', '10:00', new Set(['any::Feeding']))).toEqual([])
  })

  it('prefills the morning ADL and IADL example together', () => {
    const tasks = [
      { code: 'Dressing', schedule: day({ slot_morning: 'always' }) },
      { code: 'Feeding', schedule: { ...day(), schedule_type: 'always' as const } },
      { code: 'Toileting', schedule: day({ slot_morning: 'always' }) },
      { code: 'Meal Preparation', schedule: day({ slot_morning: 'always' }) },
    ]
    expect(suggestedVisitTaskTokens(tasks, '09:00', '10:00', new Set())).toEqual([
      'morning::Dressing', 'any::Feeding', 'morning::Toileting', 'morning::Meal Preparation',
    ])
  })
})
