import {
  round2,
  toHHMM,
  hoursFromSchedule,
  calcAmount,
  serviceTypeLabelFn,
  getWeekKey,
} from '@/lib/payroll-calculations'

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.234)).toBe(1.23)
    expect(round2(1.235)).toBe(1.24)
  })

  it('handles floating point edge cases via epsilon', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.999)).toBe(3)
  })

  it('handles whole numbers', () => {
    expect(round2(8)).toBe(8)
    expect(round2(0)).toBe(0)
  })
})

describe('toHHMM', () => {
  it('slices HH:MM from full time string', () => {
    expect(toHHMM('09:30:00')).toBe('09:30')
    expect(toHHMM('14:00:00')).toBe('14:00')
  })

  it('returns as-is when already HH:MM', () => {
    expect(toHHMM('09:30')).toBe('09:30')
  })

  it('returns placeholder for null or empty', () => {
    expect(toHHMM(null)).toBe('--:--')
    expect(toHHMM(undefined)).toBe('--:--')
    expect(toHHMM('')).toBe('--:--')
  })
})

describe('hoursFromSchedule', () => {
  it('calculates hours between two times', () => {
    expect(hoursFromSchedule('09:00', '17:00')).toBe(8)
    expect(hoursFromSchedule('08:30', '12:00')).toBe(3.5)
    expect(hoursFromSchedule('00:00', '00:15')).toBe(0.25)
  })

  it('returns 0 for null or missing inputs', () => {
    expect(hoursFromSchedule(null, '17:00')).toBe(0)
    expect(hoursFromSchedule('09:00', null)).toBe(0)
    expect(hoursFromSchedule(null, null)).toBe(0)
  })

  it('returns 0 for invalid time strings', () => {
    expect(hoursFromSchedule('bad', '17:00')).toBe(0)
    expect(hoursFromSchedule('09:00', 'bad')).toBe(0)
  })

  it('returns 0 when end is not after start (overnight not supported)', () => {
    // 22:00 → 06:00 crosses midnight — current implementation returns 0
    expect(hoursFromSchedule('22:00', '06:00')).toBe(0)
    expect(hoursFromSchedule('12:00', '12:00')).toBe(0)
  })
})

describe('calcAmount', () => {
  it('calculates hourly pay', () => {
    expect(calcAmount(8, 20, null)).toBe(160)
    expect(calcAmount(8, 20, 'hourly')).toBe(160)
    expect(calcAmount(4.5, 18, null)).toBe(81)
  })

  it('returns flat rate for visit unit', () => {
    expect(calcAmount(1, 50, 'visit')).toBe(50)
    expect(calcAmount(8, 50, 'visit')).toBe(50) // hours are ignored
  })

  it('calculates 15-min unit pay', () => {
    // 8 hours × 4 units/hr = 32 units × $5 = $160
    expect(calcAmount(8, 5, '15_min_unit')).toBe(160)
    // 1 hour = 4 units × $10 = $40
    expect(calcAmount(1, 10, '15_min_unit')).toBe(40)
  })

  it('returns 0 for non-finite inputs', () => {
    expect(calcAmount(NaN, 20, null)).toBe(0)
    expect(calcAmount(8, NaN, null)).toBe(0)
  })
})

describe('serviceTypeLabelFn', () => {
  it('returns visit type when provided', () => {
    expect(serviceTypeLabelFn('skilled', 'Physical Therapy')).toBe('Physical Therapy')
    expect(serviceTypeLabelFn('non_skilled', 'Companion Care')).toBe('Companion Care')
  })

  it('falls back to service type label when visit type is empty', () => {
    expect(serviceTypeLabelFn('skilled', null)).toBe('Skilled')
    expect(serviceTypeLabelFn('non_skilled', null)).toBe('HHA/CNA')
    expect(serviceTypeLabelFn('skilled', '')).toBe('Skilled')
    expect(serviceTypeLabelFn('skilled', '   ')).toBe('Skilled')
  })
})

describe('getWeekKey', () => {
  const cg = 'caregiver-123'

  it('week starts Sunday (0) — Wednesday visit maps to previous Sunday', () => {
    // 2026-05-13 is a Wednesday
    const key = getWeekKey(cg, '2026-05-13', 0)
    expect(key).toBe(`${cg}__2026-05-10`) // Sunday May 10
  })

  it('week starts Monday (1) — Wednesday visit maps to previous Monday', () => {
    const key = getWeekKey(cg, '2026-05-13', 1)
    expect(key).toBe(`${cg}__2026-05-11`) // Monday May 11
  })

  it('week starts Saturday (6) — Sunday visit maps to previous Saturday', () => {
    // 2026-05-10 is a Sunday
    const key = getWeekKey(cg, '2026-05-10', 6)
    expect(key).toBe(`${cg}__2026-05-09`) // Saturday May 9
  })

  it('visit on the week-start day maps to itself', () => {
    // 2026-05-11 is a Monday, week starts Monday (1)
    const key = getWeekKey(cg, '2026-05-11', 1)
    expect(key).toBe(`${cg}__2026-05-11`)
  })

  it('includes caregiverId in the key to keep accumulators separate', () => {
    const key1 = getWeekKey('cg-A', '2026-05-13', 0)
    const key2 = getWeekKey('cg-B', '2026-05-13', 0)
    expect(key1).not.toBe(key2)
    expect(key1).toContain('cg-A')
    expect(key2).toContain('cg-B')
  })
})
