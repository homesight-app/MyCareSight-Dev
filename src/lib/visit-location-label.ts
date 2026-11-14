import type { ScheduleRow } from '@/lib/supabase/query/schedules'

export function visitLocationLabel(schedule: Pick<ScheduleRow, 'patient_address'>): string {
  const address = schedule.patient_address
  if (!address) return 'No visit location'
  if (address.city && address.state) return `${address.city}, ${address.state}`
  return address.label || address.street_address || 'Visit location'
}
