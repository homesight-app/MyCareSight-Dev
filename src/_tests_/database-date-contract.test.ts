/** @jest-environment node */
import {
  databaseDate,
  databaseTimestamp,
  normalizeDatabaseRow,
  normalizeDatabaseResultValue,
  POSTGRES_DATE_OID,
  POSTGRES_TIMESTAMP_OIDS,
} from '@/lib/database-date-contract'

describe('database date contract', () => {
  it('preserves a calendar date independently of the local timezone', () => {
    expect(databaseDate(new Date('2026-10-01T00:00:00.000Z'))).toBe('2026-10-01')
    expect(databaseDate('2026-10-01')).toBe('2026-10-01')
    expect(databaseDate('2026-10-01T00:00:00.000Z')).toBe('2026-10-01')
  })

  it('serializes timestamp objects and preserves existing strings', () => {
    expect(databaseTimestamp(new Date('2026-10-01T12:30:00.000Z')))
      .toBe('2026-10-01T12:30:00.000Z')
    expect(databaseTimestamp('2026-10-01T12:30:00+00:00'))
      .toBe('2026-10-01T12:30:00+00:00')
  })

  it('normalizes selected fields while preserving null and missing fields', () => {
    const row = normalizeDatabaseRow({
      due_date: new Date('2026-10-01T00:00:00.000Z'),
      completed_at: null,
      title: 'Synthetic task',
    }, {
      dates: ['due_date'],
      timestamps: ['completed_at'],
    })

    expect(row).toEqual({
      due_date: '2026-10-01',
      completed_at: null,
      title: 'Synthetic task',
    })
  })

  it('fails closed for invalid date values', () => {
    expect(() => databaseDate(new Date(Number.NaN))).toThrow('invalid date')
    expect(() => databaseDate('October 1, 2026')).toThrow('invalid calendar date')
  })

  it('normalizes PostgreSQL dates and timestamps at the driver boundary', () => {
    expect(normalizeDatabaseResultValue(
      new Date('2026-10-08T00:00:00.000Z'),
      { type: POSTGRES_DATE_OID }
    )).toBe('2026-10-08')

    const timestamp = new Date('2026-10-08T14:30:00.000Z')
    expect(normalizeDatabaseResultValue(timestamp, { type: POSTGRES_TIMESTAMP_OIDS[1] }))
      .toBe('2026-10-08T14:30:00.000Z')
    expect(normalizeDatabaseResultValue(null, { type: POSTGRES_DATE_OID })).toBeNull()
    expect(normalizeDatabaseResultValue(7, { type: 23 })).toBe(7)
  })

  it('fails closed when PostgreSQL DATE decoding produces an unexpected value', () => {
    expect(() => normalizeDatabaseResultValue(42, { type: POSTGRES_DATE_OID }))
      .toThrow('invalid calendar date value')
    expect(() => normalizeDatabaseResultValue(42, { type: POSTGRES_TIMESTAMP_OIDS[0] }))
      .toThrow('invalid timestamp value')
  })
})
