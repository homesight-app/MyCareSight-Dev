/** Resolve caregiver pay for a visit date from `caregiver_pay_rates`. */

export type CaregiverPayRateRow = {
  caregiver_member_id: string
  pay_rate: number
  unit_type: string | null
  service_type: string | null
  effective_start: string
  effective_end: string | null
}

export function pickCaregiverPayRateForVisit(
  caregiverId: string,
  serviceType: string,
  visitDate: string,
  rows: CaregiverPayRateRow[]
): CaregiverPayRateRow | null {
  const candidates = rows.filter(
    (r) =>
      r.caregiver_member_id === caregiverId &&
      (r.service_type == null || r.service_type === serviceType) &&
      r.effective_start <= visitDate &&
      (!r.effective_end || r.effective_end > visitDate)
  )
  const hit = candidates
    .sort((a, b) => {
      const byStart = b.effective_start.localeCompare(a.effective_start)
      if (byStart !== 0) return byStart
      const aSpec = a.service_type != null ? 1 : 0
      const bSpec = b.service_type != null ? 1 : 0
      return bSpec - aSpec
    })[0]
  return hit ?? null
}

/** Resolve pay from caregiver_pay_rates only. */
export function resolvePayRateForVisit(
  caregiverId: string,
  serviceType: string,
  visitDate: string,
  caregiverPayRows: CaregiverPayRateRow[]
): { rate: number; unit_type: string | null; source: 'caregiver_pay_rates' } | null {
  const modern = pickCaregiverPayRateForVisit(caregiverId, serviceType, visitDate, caregiverPayRows)
  if (modern) return { rate: Number(modern.pay_rate ?? 0), unit_type: modern.unit_type, source: 'caregiver_pay_rates' }
  return null
}
