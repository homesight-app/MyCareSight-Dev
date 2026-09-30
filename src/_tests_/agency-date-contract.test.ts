/** @jest-environment node */

import {
  normalizeAgencyTemporalRow,
  normalizeAgencyTemporalRows,
} from '@/lib/agency-date-contract'

describe('agency temporal repository boundary', () => {
  it('serializes every agency calendar date without shifting the day', () => {
    const row = normalizeAgencyTemporalRow({
      date_of_formation: new Date('2021-04-05T00:00:00.000Z'),
      prev_license_closed_date: new Date('2022-06-07T00:00:00.000Z'),
      date_of_incorporation: new Date('2023-08-09T00:00:00.000Z'),
      created_at: new Date('2026-09-30T17:00:00.000Z'),
      updated_at: null,
    })

    expect(row).toEqual({
      date_of_formation: '2021-04-05',
      prev_license_closed_date: '2022-06-07',
      date_of_incorporation: '2023-08-09',
      created_at: '2026-09-30T17:00:00.000Z',
      updated_at: null,
    })
  })

  it('normalizes list rows and preserves existing strings and missing fields', () => {
    expect(normalizeAgencyTemporalRows([
      { id: 'one', date_of_formation: '2024-01-02' },
      { id: 'two', date_of_formation: null },
    ])).toEqual([
      { id: 'one', date_of_formation: '2024-01-02' },
      { id: 'two', date_of_formation: null },
    ])
  })
})
