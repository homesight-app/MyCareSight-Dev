import { databaseDate, type DatabaseTemporalValue } from '@/lib/database-date-contract'

export type TimeBillingVisitRow = {
  id: string
  patient_id: string
  caregiver_member_id: string | null
  visit_date: string
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  scheduled_end_date: string | null
  service_type: string | null
  mileage_miles: number | null
}

export type RawTimeBillingVisitRow = Omit<TimeBillingVisitRow, 'visit_date' | 'scheduled_end_date'> & {
  visit_date: DatabaseTemporalValue
  scheduled_end_date: DatabaseTemporalValue | null
}

/** Keep PostgreSQL driver-owned Date objects out of the client component boundary. */
export function normalizeTimeBillingVisitRow(row: RawTimeBillingVisitRow): TimeBillingVisitRow {
  return {
    ...row,
    visit_date: databaseDate(row.visit_date),
    scheduled_end_date: row.scheduled_end_date == null ? null : databaseDate(row.scheduled_end_date),
  }
}
