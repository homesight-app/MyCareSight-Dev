import type { Supabase } from '@/lib/supabase/types'

export type TimeBillingStatus = 'pending' | 'approved' | 'voided'

export type TimeBillingRow = {
  /** Row key = scheduled visit id. */
  id: string
  scheduledVisitId: string
  date: string
  /** `patients.id` — for filter dropdowns. */
  clientId: string
  /** `caregiver_members.id` when assigned; empty string if none. */
  caregiverId: string
  clientName: string
  caregiverName: string
  timeLabel: string
  actualHours: number
  billableHours: number
  serviceType: 'non_skilled' | 'skilled'
  mileageMiles: number
  note: string | null
  status: TimeBillingStatus
}

function toHHMM(t: string | null): string {
  if (!t) return '--:--'
  return String(t).slice(0, 5)
}

import { hoursFromScheduleWithDates } from '@/lib/payroll-calculations'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export async function fetchTimeBillingRows(supabase: Supabase): Promise<{ rows: TimeBillingRow[]; error?: string }> {
  const { data: visits, error: visitsErr } = await supabase
    .from('scheduled_visits')
    .select(
      'id, patient_id, caregiver_member_id, visit_date, scheduled_start_time, scheduled_end_time, scheduled_end_date, service_type, mileage_miles'
    )
    .eq('status', 'completed')
    .order('visit_date', { ascending: false })
  if (visitsErr) return { rows: [], error: visitsErr.message }

  const visitList = visits ?? []
  if (visitList.length === 0) return { rows: [] }

  const patientIds = Array.from(new Set(visitList.map((v) => v.patient_id)))
  const caregiverIds = Array.from(
    new Set(visitList.flatMap((v) => (v.caregiver_member_id ? [v.caregiver_member_id] : [])))
  )
  const visitIds = visitList.map((v) => v.id)

  const [patRes, cgRes, financialsRes, approvalsRes, entriesRes] = await Promise.all([
    supabase.from('patients').select('id, full_name').in('id', patientIds),
    caregiverIds.length
      ? supabase.from('caregiver_members').select('id, first_name, last_name').in('id', caregiverIds)
      : Promise.resolve({ data: [], error: null } as const),
    visitIds.length
      ? supabase
          .from('visit_financials')
          .select(
            'scheduled_visit_id, service_type, status, approved_billable_hours, approved_actual_hours, coordinator_note'
          )
          .in('scheduled_visit_id', visitIds)
      : Promise.resolve({ data: [], error: null } as const),
    visitIds.length
      ? supabase
          .from('visit_approvals')
          .select(
            'scheduled_visit_id, approval_status, approved_billable_hours, approved_actual_hours, approval_comment'
          )
          .in('scheduled_visit_id', visitIds)
      : Promise.resolve({ data: [], error: null } as const),
    visitIds.length
      ? supabase
          .from('visit_time_entries')
          .select('scheduled_visit_id, actual_hours, billable_hours')
          .in('scheduled_visit_id', visitIds)
      : Promise.resolve({ data: [], error: null } as const),
  ])

  if (patRes.error) return { rows: [], error: patRes.error.message }
  if (cgRes.error) return { rows: [], error: cgRes.error.message }
  if (financialsRes.error) return { rows: [], error: financialsRes.error.message }
  if (approvalsRes.error) return { rows: [], error: approvalsRes.error.message }
  if (entriesRes.error) return { rows: [], error: entriesRes.error.message }

  const patientNameById = new Map((patRes.data ?? []).map((r) => [r.id, r.full_name ?? 'Client']))
  const caregiverNameById = new Map(
    (cgRes.data ?? []).map((r) => [r.id, [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Caregiver'])
  )

  type FinancialRow = {
    scheduled_visit_id: string
    service_type?: string | null
    status?: string | null
    approved_billable_hours?: number | null
    approved_actual_hours?: number | null
    coordinator_note?: string | null
  }
  const financialByVisitId = new Map(
    ((financialsRes.data ?? []) as FinancialRow[]).map((r) => [r.scheduled_visit_id, r])
  )

  type ApprovalRow = {
    scheduled_visit_id: string
    approval_status: string | null
    approved_billable_hours?: number | null
    approved_actual_hours?: number | null
    approval_comment?: string | null
  }
  const approvalByVisitId = new Map(
    ((approvalsRes.data ?? []) as ApprovalRow[]).map((r) => [r.scheduled_visit_id, r])
  )

  type EntryRow = {
    scheduled_visit_id: string
    actual_hours?: number | null
    billable_hours?: number | null
  }
  const entryByVisitId = new Map(
    ((entriesRes.data ?? []) as EntryRow[]).map((r) => [r.scheduled_visit_id, r])
  )

  const rows: TimeBillingRow[] = visitList
    .filter((sv) => financialByVisitId.has(String(sv.id)) || approvalByVisitId.has(String(sv.id)))
    .map((sv) => {
      const date = sv.visit_date ?? ''
      const financial = financialByVisitId.get(sv.id)
      const approval = approvalByVisitId.get(sv.id)
      const entry = entryByVisitId.get(sv.id)
      const serviceType =
        ((financial?.service_type ?? sv.service_type) === 'skilled' ? 'skilled' : 'non_skilled') as
          | 'non_skilled'
          | 'skilled'
      const caregiverId = sv.caregiver_member_id ?? ''
      const scheduleHours = hoursFromScheduleWithDates(
        sv.visit_date,
        sv.scheduled_start_time,
        (sv as any).scheduled_end_date,
        sv.scheduled_end_time
      )

      const resolve = (fin: number | null | undefined, appr: number | null | undefined, ent: number | null | undefined) => {
        const f = fin != null ? Number(fin) : NaN
        const a = appr != null ? Number(appr) : NaN
        const e = ent != null ? Number(ent) : NaN
        return round2(Number.isFinite(f) ? f : Number.isFinite(a) ? a : Number.isFinite(e) ? e : scheduleHours)
      }

      const actualHours = resolve(
        financial?.approved_actual_hours,
        approval?.approved_actual_hours,
        entry?.actual_hours
      )
      const billableHours = resolve(
        financial?.approved_billable_hours,
        approval?.approved_billable_hours,
        entry?.billable_hours
      )

      const status: TimeBillingStatus =
        approval?.approval_status === 'approved'
          ? 'approved'
          : financial?.status === 'voided'
            ? 'voided'
            : 'pending'

      return {
        id: sv.id,
        scheduledVisitId: sv.id,
        date,
        clientId: sv.patient_id ?? '',
        caregiverId,
        clientName: patientNameById.get(sv.patient_id) ?? 'Client',
        caregiverName: caregiverId ? (caregiverNameById.get(caregiverId) ?? 'Caregiver') : '—',
        timeLabel: `${toHHMM(sv.scheduled_start_time)} - ${toHHMM(sv.scheduled_end_time)}`,
        actualHours,
        billableHours,
        serviceType,
        mileageMiles: sv.mileage_miles != null ? Number(sv.mileage_miles) : 0,
        note: approval?.approval_comment ?? financial?.coordinator_note ?? null,
        status,
      }
    })

  return { rows }
}
