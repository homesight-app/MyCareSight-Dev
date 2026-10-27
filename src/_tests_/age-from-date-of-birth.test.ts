import { ageFromDateOfBirth } from '@/lib/age-from-date-of-birth'

describe('ageFromDateOfBirth', () => {
  const today = new Date(2026, 9, 27)

  it('calculates age from a database date even when no stored age is available', () => {
    expect(ageFromDateOfBirth('1952-11-11', today)).toBe(73)
    expect(ageFromDateOfBirth('1952-10-27', today)).toBe(74)
    expect(ageFromDateOfBirth('1952-10-26', today)).toBe(74)
  })

  it('uses the calendar date of an ISO timestamp without shifting the birthday', () => {
    expect(ageFromDateOfBirth('2000-10-28T00:00:00.000Z', today)).toBe(25)
  })

  it('handles leap-day birthdays and invalid or future dates', () => {
    expect(ageFromDateOfBirth('2000-02-29', new Date(2026, 1, 28))).toBe(25)
    expect(ageFromDateOfBirth('2000-02-29', new Date(2026, 2, 1))).toBe(26)
    expect(ageFromDateOfBirth('2026-02-30', today)).toBeNull()
    expect(ageFromDateOfBirth('2027-01-01', today)).toBeNull()
    expect(ageFromDateOfBirth(null, today)).toBeNull()
  })
})
