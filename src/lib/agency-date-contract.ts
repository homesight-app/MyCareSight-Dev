import { normalizeDatabaseRow, normalizeDatabaseRows } from '@/lib/database-date-contract'

const AGENCY_DATE_FIELDS = [
  'date_of_formation',
  'prev_license_closed_date',
  'date_of_incorporation',
] as const

const AGENCY_TIMESTAMP_FIELDS = ['created_at', 'updated_at'] as const

/** Normalize PostgreSQL temporal values before an agency row reaches a client component. */
export function normalizeAgencyTemporalRow<T extends Record<string, unknown>>(row: T): T {
  return normalizeDatabaseRow(row, {
    dates: AGENCY_DATE_FIELDS as readonly (keyof T)[],
    timestamps: AGENCY_TIMESTAMP_FIELDS as readonly (keyof T)[],
  })
}

export function normalizeAgencyTemporalRows<T extends Record<string, unknown>>(
  rows: readonly T[]
): T[] {
  return normalizeDatabaseRows(rows, {
    dates: AGENCY_DATE_FIELDS as readonly (keyof T)[],
    timestamps: AGENCY_TIMESTAMP_FIELDS as readonly (keyof T)[],
  })
}
