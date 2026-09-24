import sql from '@/db'
import { patientFullName } from '@/lib/patient-name'
import { hoursFromScheduleWithDates } from '@/lib/payroll-calculations'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'

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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export async function fetchTimeBillingRows(
  opts?: { startDate?: string; endDate?: string }
): Promise<{ rows: TimeBillingRow[]; error?: string; agencyId?: string }> {
  try{
    return await withAgencyManagerFinancialRead(async actor=>{
      const result=await fetchScopedTimeBillingRows({...opts,agencyId:actor.agencyId})
      if(result.error) throw new Error(result.error)
      await sql`INSERT INTO audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES(${actor.agencyId}::uuid,'visit_financials',NULL,'READ',${actor.id}::uuid,
        ${JSON.stringify({operation:'read_time_billing_dashboard',resource_ids:result.rows.map(row=>row.scheduledVisitId),result_count:result.rows.length})}::jsonb)`
      return {...result,agencyId:actor.agencyId}
    })
  }catch{return {rows:[],error:'Unable to load time and billing'}}
}

async function fetchScopedTimeBillingRows(
  opts: { startDate?: string; endDate?: string; agencyId: string }
): Promise<{ rows: TimeBillingRow[]; error?: string }> {
  type VisitRow = {
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

  let visitList: VisitRow[]
  try {
    const startFilter = opts?.startDate ? sql`AND visit_date >= ${opts.startDate}` : sql``
    const endFilter = opts?.endDate ? sql`AND visit_date <= ${opts.endDate}` : sql``
    const agencyFilter = opts?.agencyId ? sql`AND agency_id = ${opts.agencyId}` : sql``
    visitList = await sql<VisitRow[]>`
      SELECT id, patient_id, caregiver_member_id, visit_date, scheduled_start_time,
             scheduled_end_time, scheduled_end_date, service_type, mileage_miles
      FROM scheduled_visits
      WHERE status = 'completed'
      ${agencyFilter}
      ${startFilter}
      ${endFilter}
      ORDER BY visit_date DESC
    `
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : 'Failed to load visits' }
  }

  if (visitList.length === 0) return { rows: [] }

  const patientIds = Array.from(new Set(visitList.map((v) => v.patient_id)))
  const caregiverIds = Array.from(
    new Set(visitList.flatMap((v) => (v.caregiver_member_id ? [v.caregiver_member_id] : [])))
  )
  const visitIds = visitList.map((v) => v.id)

  type PatRow = { id: string; first_name: string | null; last_name: string | null }
  type CgRow = { id: string; first_name: string | null; last_name: string | null }
  type FinancialRow = {
    scheduled_visit_id: string
    service_type?: string | null
    status?: string | null
    approved_billable_hours?: number | null
    approved_actual_hours?: number | null
    coordinator_note?: string | null
  }
  type ApprovalRow = {
    scheduled_visit_id: string
    approval_status: string | null
    approved_billable_hours?: number | null
    approved_actual_hours?: number | null
    approval_comment?: string | null
  }
  type EntryRow = {
    scheduled_visit_id: string
    actual_hours?: number | null
    billable_hours?: number | null
  }

  let patRows: PatRow[]
  let cgRows: CgRow[]
  let financialRows: FinancialRow[]
  let approvalRows: ApprovalRow[]
  let entryRows: EntryRow[]

  try {
    ;[patRows, cgRows, financialRows, approvalRows, entryRows] = await Promise.all([
      sql<PatRow[]>`
        SELECT id, first_name, last_name FROM patients
        WHERE id = ANY(${patientIds}::uuid[])
      `,
      caregiverIds.length > 0
        ? sql<CgRow[]>`
            SELECT id, first_name, last_name FROM caregiver_members
            WHERE id = ANY(${caregiverIds}::uuid[])
          `
        : Promise.resolve([] as CgRow[]),
      sql<FinancialRow[]>`
        SELECT scheduled_visit_id, service_type, status, approved_billable_hours,
               approved_actual_hours, coordinator_note
        FROM visit_financials
        WHERE scheduled_visit_id = ANY(${visitIds}::uuid[])
      `,
      sql<ApprovalRow[]>`
        SELECT scheduled_visit_id, approval_status, approved_billable_hours,
               approved_actual_hours, approval_comment
        FROM visit_approvals
        WHERE scheduled_visit_id = ANY(${visitIds}::uuid[])
      `,
      sql<EntryRow[]>`
        SELECT scheduled_visit_id, actual_hours, billable_hours
        FROM visit_time_entries
        WHERE scheduled_visit_id = ANY(${visitIds}::uuid[])
      `,
    ])
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : 'Failed to load visit details' }
  }

  const patientNameById = new Map(
    patRows.map((r) => [r.id, patientFullName(r as { first_name: string; last_name: string })])
  )
  const caregiverNameById = new Map(
    cgRows.map((r) => [r.id, [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Caregiver'])
  )

  const financialByVisitId = new Map(financialRows.map((r) => [r.scheduled_visit_id, r]))
  const approvalByVisitId = new Map(approvalRows.map((r) => [r.scheduled_visit_id, r]))
  const entryByVisitId = new Map(entryRows.map((r) => [r.scheduled_visit_id, r]))

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
        sv.scheduled_end_date,
        sv.scheduled_end_time
      )

      const resolve = (
        fin: number | null | undefined,
        appr: number | null | undefined,
        ent: number | null | undefined
      ) => {
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
