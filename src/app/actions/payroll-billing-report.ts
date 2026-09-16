'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import sql from '@/db'
import { appendCaregiverPayRateAction } from '@/app/actions/caregiver-pay-rates'
import { fetchPayrollBillingReportRows, type PayrollBillingDetailRow } from '@/lib/payroll-billing-report'
import type { PatientServiceContractRow } from '@/lib/supabase/query/patient-service-contracts'
import {
  patientServiceContractOverlapsDate,
  WEEKLY_HOURS_CONTRACT_TYPE,
} from '@/lib/patient-service-contract-effective'
import { patientFullName } from '@/lib/patient-name'

const REPORT_PATH = '/pages/agency/reports/payroll-billing'

export async function getPayrollBillingReportRowsAction(
  dateFrom: string,
  dateTo: string
): Promise<{ rows: PayrollBillingDetailRow[]; error?: string }> {
  const session = await getSession()
  if (!session) return { rows: [], error: 'Not signed in.' }

  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  return withUserContext(session.user.id, role, agencyId, () =>
    fetchPayrollBillingReportRows({ agencyId, dateFrom, dateTo })
  )
}

export type RateManagerPayRow = {
  id: string
  caregiver_member_id: string
  caregiverName: string
  service_type: string | null
  rate: number
  unit_type: string
  effective_start: string
  effective_end: string | null
}

export type RateManagerBillRow = {
  id: string
  patient_id: string
  clientName: string
  contract_name: string | null
  contract_type: string
  service_type: string
  bill_rate: number | null
  bill_unit_type: string
  effective_date: string
}

type PayRateRow = {
  id: string
  caregiver_member_id: string | null
  service_type: string | null
  pay_rate: number | null
  unit_type: string | null
  effective_start: string | null
  effective_end: string | null
}

type CaregiverNameRow = {
  id: string
  first_name: string | null
  last_name: string | null
}

type BillContractRow = {
  id: string
  patient_id: string | null
  contract_name: string | null
  contract_type: string | null
  service_type: string | null
  bill_rate: number | null
  bill_unit_type: string | null
  effective_date: string | null
  end_date: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

type PatientNameRow = {
  id: string
  first_name: string | null
  last_name: string | null
}

export async function getRateManagerDataAction(): Promise<{
  payRows: RateManagerPayRow[]
  billRows: RateManagerBillRow[]
  error?: string
}> {
  const session = await getSession()
  if (!session) return { payRows: [], billRows: [], error: 'Not signed in.' }

  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  if (!agencyId) return { payRows: [], billRows: [], error: 'No agency context.' }

  return withUserContext(session.user.id, role, agencyId, () => _getRateManagerData(session.user.id, agencyId))
}

async function _getRateManagerData(
  _userId: string,
  agencyId: string
): Promise<{ payRows: RateManagerPayRow[]; billRows: RateManagerBillRow[]; error?: string }> {

  let payData: PayRateRow[]
  try {
    payData = await sql<PayRateRow[]>`
      SELECT id, caregiver_member_id, service_type, pay_rate, unit_type, effective_start, effective_end
      FROM caregiver_pay_rates
      WHERE agency_id = ${agencyId} AND effective_end IS NULL
      ORDER BY effective_start DESC
    `
  } catch (err) {
    return { payRows: [], billRows: [], error: err instanceof Error ? err.message : 'Failed to load pay rates' }
  }

  const cgIds = Array.from(new Set(payData.map(r => r.caregiver_member_id).filter(Boolean))) as string[]
  let nameByCg = new Map<string, string>()
  if (cgIds.length) {
    const cgs = await sql<CaregiverNameRow[]>`SELECT id, first_name, last_name FROM caregiver_members WHERE id = ANY(${cgIds}::uuid[])`
    nameByCg = new Map(cgs.map(c => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Caregiver']))
  }

  const payRows: RateManagerPayRow[] = payData
    .filter(r => r.caregiver_member_id)
    .map(r => ({
      id: r.id,
      caregiver_member_id: r.caregiver_member_id!,
      caregiverName: nameByCg.get(r.caregiver_member_id!) ?? 'Caregiver',
      service_type: r.service_type ?? null,
      rate: Number(r.pay_rate ?? 0),
      unit_type: String(r.unit_type ?? 'hour'),
      effective_start: String(r.effective_start ?? ''),
      effective_end: r.effective_end ?? null,
    }))

  let billData: BillContractRow[]
  try {
    billData = await sql<BillContractRow[]>`
      SELECT id, patient_id, contract_name, contract_type, service_type, bill_rate, bill_unit_type,
             effective_date, end_date, status, created_at, updated_at
      FROM patient_service_contracts
      WHERE agency_id = ${agencyId} AND contract_type != 'weekly_hours'
      ORDER BY effective_date DESC
    `
  } catch (err) {
    return { payRows, billRows: [], error: err instanceof Error ? err.message : 'Failed to load bill rates' }
  }

  const todayYmd = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const asOf = todayYmd()
  const billDataFiltered = billData.filter(r => {
    if (r.contract_type === WEEKLY_HOURS_CONTRACT_TYPE) return false
    return patientServiceContractOverlapsDate(r as PatientServiceContractRow, asOf)
  })

  const patientIds = Array.from(new Set(billDataFiltered.map(r => r.patient_id).filter(Boolean))) as string[]
  let pats: PatientNameRow[] = []
  if (patientIds.length > 0) {
    pats = await sql<PatientNameRow[]>`SELECT id, first_name, last_name FROM patients WHERE id = ANY(${patientIds}::uuid[])`
  }
  const patientName = new Map(pats.map(p => [p.id, patientFullName(p as { first_name: string; last_name: string })]))

  const billRows: RateManagerBillRow[] = billDataFiltered.map(r => ({
    id: r.id,
    patient_id: r.patient_id!,
    clientName: patientName.get(r.patient_id!) ?? 'Client',
    contract_name: r.contract_name ?? null,
    contract_type: String(r.contract_type ?? ''),
    service_type: String(r.service_type ?? ''),
    bill_rate: r.bill_rate != null ? Number(r.bill_rate) : null,
    bill_unit_type: String(r.bill_unit_type ?? 'hour'),
    effective_date: String(r.effective_date ?? ''),
  }))

  return { payRows, billRows }
}

export async function updateCaregiverPayRateFromManagerAction(
  caregiverMemberId: string,
  serviceType: string | null,
  rate: number,
  effectiveDate?: string
): Promise<{ ok?: true; error?: string }> {
  const res = await appendCaregiverPayRateAction({
    caregiverMemberId,
    payRate: rate,
    effectiveDate,
    serviceType,
  })
  if (res.error) return { error: res.error }
  revalidatePath(REPORT_PATH)
  return { ok: true }
}

type ContractRow = {
  id: string
  agency_id: string | null
  patient_id: string | null
  service_type: string | null
  bill_rate: number | null
  bill_unit_type: string | null
  effective_date: string | null
  end_date: string | null
}

type VisitRow = {
  id: string
  agency_id: string | null
  patient_id: string | null
  caregiver_member_id: string | null
  visit_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  scheduled_end_date: string | null
}

type FinanceRow = {
  scheduled_visit_id: string
  status: string | null
  approved_billable_hours: number | null
  bill_rate: number | null
}

type TimeEntryRow = {
  id: string
  scheduled_visit_id: string
}

export async function updatePatientServiceContractBillRateAction(
  id: string,
  bill_rate: number
): Promise<{ ok?: true; error?: string }> {
  if (!Number.isFinite(bill_rate) || bill_rate < 0) return { error: 'Invalid bill rate.' }
  const session = await getSession()
  if (!session) return { error: 'Not authenticated.' }

  const [contract] = await sql<ContractRow[]>`
    SELECT id, agency_id, patient_id, service_type, bill_rate, bill_unit_type, effective_date, end_date
    FROM patient_service_contracts WHERE id = ${id} LIMIT 1
  `
  if (!contract) return { error: 'Contract not found.' }

  let scopedVisits: VisitRow[]
  try {
    if (contract.end_date) {
      scopedVisits = await sql<VisitRow[]>`
        SELECT id, agency_id, patient_id, caregiver_member_id, visit_date,
               scheduled_start_time, scheduled_end_time, scheduled_end_date
        FROM scheduled_visits
        WHERE status = 'completed' AND patient_id = ${contract.patient_id}
          AND service_type = ${contract.service_type}
          AND visit_date >= ${contract.effective_date}
          AND visit_date <= ${contract.end_date}
      `
    } else {
      scopedVisits = await sql<VisitRow[]>`
        SELECT id, agency_id, patient_id, caregiver_member_id, visit_date,
               scheduled_start_time, scheduled_end_time, scheduled_end_date
        FROM scheduled_visits
        WHERE status = 'completed' AND patient_id = ${contract.patient_id}
          AND service_type = ${contract.service_type}
          AND visit_date >= ${contract.effective_date}
      `
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load visits' }
  }

  const visitIds = scopedVisits.map(v => v.id)

  let financeRows: FinanceRow[] = []
  if (visitIds.length) {
    financeRows = await sql<FinanceRow[]>`
      SELECT scheduled_visit_id, status, approved_billable_hours, bill_rate
      FROM visit_financials WHERE scheduled_visit_id = ANY(${visitIds}::uuid[])
    `
  }
  const finByVisitId = new Map(financeRows.map(r => [r.scheduled_visit_id, r]))

  const nonPendingVisits = scopedVisits.filter(v => {
    const fin = finByVisitId.get(v.id)
    const st = (fin?.status ?? 'pending').toLowerCase()
    return st === 'approved' || st === 'voided'
  })
  const withNoFrozen = nonPendingVisits.filter(v => {
    const fin = finByVisitId.get(v.id)
    return fin?.bill_rate == null
  })

  if (withNoFrozen.length > 0) {
    const toMinutes = (t: string | null | undefined) => {
      if (!t) return NaN
      const [h, m] = String(t).slice(0, 5).split(':').map(x => parseInt(x, 10))
      if (!Number.isFinite(h)) return NaN
      return h * 60 + (Number.isFinite(m) ? m : 0)
    }
    const now = new Date().toISOString()
    const updatePayloads = withNoFrozen.map(v => {
      const a = toMinutes(v.scheduled_start_time)
      const b = toMinutes(v.scheduled_end_time)
      const scheduleHours = !Number.isFinite(a) || !Number.isFinite(b) || b <= a ? 0 : Math.round((((b - a) / 60) + Number.EPSILON) * 100) / 100
      const fin = finByVisitId.get(v.id)
      const bh = fin?.approved_billable_hours != null ? Number(fin.approved_billable_hours) : NaN
      const hours = Number.isFinite(bh) ? bh : scheduleHours
      const unit = String(contract.bill_unit_type ?? 'hour')
      const rate = Number(contract.bill_rate ?? 0)
      const amount =
        unit === 'visit' ? rate
        : unit === '15_min_unit' ? rate * Math.round(hours * 4)
        : rate * hours
      return {
        scheduled_visit_id: v.id,
        status: (fin?.status ?? '').toLowerCase() === 'voided' ? 'voided' : 'approved',
        bill_rate: rate,
        bill_amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        updated_at: now,
      }
    })
    try {
      for (const payload of updatePayloads) {
        await sql`
          INSERT INTO visit_financials ${sql(payload)}
          ON CONFLICT (scheduled_visit_id) DO UPDATE SET
            status = EXCLUDED.status,
            bill_rate = EXCLUDED.bill_rate,
            bill_amount = EXCLUDED.bill_amount,
            updated_at = EXCLUDED.updated_at
        `
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update financials' }
    }
  }

  if (visitIds.length > 0) {
    const timeEntries = await sql<TimeEntryRow[]>`
      SELECT id, scheduled_visit_id FROM visit_time_entries WHERE scheduled_visit_id = ANY(${visitIds}::uuid[])
    `
    const existing = new Set(finByVisitId.keys())
    const timeEntryByVisitId = new Map(timeEntries.map(r => [r.scheduled_visit_id, r.id]))
    const toInsert = nonPendingVisits
      .filter(v => !existing.has(v.id))
      .map(v => {
        const teId = timeEntryByVisitId.get(v.id)
        if (!teId) return null
        const toMinutes = (t: string | null | undefined) => {
          if (!t) return NaN
          const [h, m] = String(t).slice(0, 5).split(':').map(x => parseInt(x, 10))
          if (!Number.isFinite(h)) return NaN
          return h * 60 + (Number.isFinite(m) ? m : 0)
        }
        const hoursFromSchedule = (() => {
          const startDate = v.visit_date
          const endDate = v.scheduled_end_date
          const effectiveEnd = endDate || startDate
          const dayDiff = (startDate && effectiveEnd)
            ? Math.max(0, Math.round((new Date(effectiveEnd + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime()) / 86_400_000))
            : 0
          const a = toMinutes(v.scheduled_start_time)
          const b = toMinutes(v.scheduled_end_time)
          if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
          return Math.round((Math.max(0, dayDiff * 24 * 60 + (b - a)) / 60 + Number.EPSILON) * 100) / 100
        })()
        const fin = finByVisitId.get(v.id)
        const hoursRaw = fin?.approved_billable_hours != null ? Number(fin.approved_billable_hours) : NaN
        const hours = Number.isFinite(hoursRaw) ? hoursRaw : hoursFromSchedule
        const unit = String(contract.bill_unit_type ?? 'hour')
        const rate = Number(contract.bill_rate ?? 0)
        const billAmount =
          unit === 'visit' ? rate
          : unit === '15_min_unit' ? rate * Math.round(hours * 4)
          : rate * hours
        return {
          agency_id: v.agency_id ?? contract.agency_id,
          scheduled_visit_id: v.id,
          visit_time_entry_id: teId,
          patient_id: v.patient_id,
          caregiver_member_id: v.caregiver_member_id ?? '',
          contract_id: contract.id,
          service_type: contract.service_type,
          status: 'approved',
          coordinator_note: null,
          pay_rate: 0,
          pay_unit_type: 'hour',
          pay_amount: 0,
          bill_rate: rate,
          bill_unit_type: String(contract.bill_unit_type ?? 'hour'),
          bill_amount: Math.round((billAmount + Number.EPSILON) * 100) / 100,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && !!x.caregiver_member_id)

    if (toInsert.length > 0) {
      try {
        for (const row of toInsert) {
          await sql`
            INSERT INTO visit_financials ${sql(row)}
            ON CONFLICT (scheduled_visit_id) DO NOTHING
          `
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to insert financials' }
      }
    }
  }

  try {
    await sql`UPDATE patient_service_contracts SET bill_rate = ${bill_rate}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update contract' }
  }

  const { error: auditErr } = await q.insertAuditLog({
    agency_id: contract.agency_id ?? undefined,
    table_name: 'patient_service_contracts',
    record_id: id,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: {
      field: 'bill_rate',
      old_bill_rate: contract.bill_rate,
      new_bill_rate: bill_rate,
      patient_id: contract.patient_id,
      service_type: contract.service_type,
    },
  })
  if (auditErr) console.error('[payroll/updateBillRate] Audit log failed. contractId=%s err=%s', id, auditErr.message)

  revalidatePath(REPORT_PATH)
  revalidatePath('/pages/agency/time-billing')
  return { ok: true }
}
