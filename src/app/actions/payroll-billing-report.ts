'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { appendCaregiverPayRateAction } from '@/app/actions/caregiver-pay-rates'
import { fetchPayrollBillingReportRows, type PayrollBillingDetailRow } from '@/lib/payroll-billing-report'
import type { PatientServiceContractRow } from '@/lib/supabase/query/patient-service-contracts'
import {
  patientServiceContractOverlapsDate,
  WEEKLY_HOURS_CONTRACT_TYPE,
} from '@/lib/patient-service-contract-effective'

const REPORT_PATH = '/pages/agency/reports/payroll-billing'

async function getViewerAgencyId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: up } = await q.getAgencyIdFromProfile(supabase, user.id)
  return up?.agency_id ?? null
}

export async function getPayrollBillingReportRowsAction(
  dateFrom: string,
  dateTo: string
): Promise<{ rows: PayrollBillingDetailRow[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { rows: [], error: 'Not signed in.' }

  const agencyId = await getViewerAgencyId()
  return fetchPayrollBillingReportRows(supabase, { agencyId, dateFrom, dateTo })
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

export async function getRateManagerDataAction(): Promise<{
  payRows: RateManagerPayRow[]
  billRows: RateManagerBillRow[]
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { payRows: [], billRows: [], error: 'Not signed in.' }

  const agencyId = await getViewerAgencyId()
  if (!agencyId) return { payRows: [], billRows: [], error: 'No agency context.' }

  const { data: payData, error: payErr } = await supabase
    .from('caregiver_pay_rates')
    .select('id, caregiver_member_id, service_type, pay_rate, unit_type, effective_start, effective_end')
    .eq('agency_id', agencyId)
    .is('effective_end', null)
    .order('effective_start', { ascending: false })

  if (payErr) return { payRows: [], billRows: [], error: payErr.message }

  const cgIds = Array.from(new Set((payData ?? []).map((r) => r.caregiver_member_id).filter(Boolean))) as string[]
  let nameByCg = new Map<string, string>()
  if (cgIds.length) {
    const { data: cgs } = await supabase
      .from('caregiver_members')
      .select('id, first_name, last_name')
      .in('id', cgIds)
    nameByCg = new Map(
      (cgs ?? []).map((c) => [c.id as string, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Caregiver'])
    )
  }

  const payRows: RateManagerPayRow[] = (payData ?? [])
    .filter((r) => r.caregiver_member_id)
    .map((r) => ({
      id: r.id as string,
      caregiver_member_id: r.caregiver_member_id as string,
      caregiverName: nameByCg.get(r.caregiver_member_id as string) ?? 'Caregiver',
      service_type: (r.service_type as string | null) ?? null,
      rate: Number(r.pay_rate ?? 0),
      unit_type: String(r.unit_type ?? 'hour'),
      effective_start: String(r.effective_start ?? ''),
      effective_end: (r.effective_end as string | null) ?? null,
    }))

  const { data: billData, error: billErr } = await supabase
    .from('patient_service_contracts')
    .select(
      'id, patient_id, contract_name, contract_type, service_type, bill_rate, bill_unit_type, effective_date, end_date, status, created_at, updated_at'
    )
    .eq('agency_id', agencyId)
    .neq('contract_type', 'weekly_hours')
    .order('effective_date', { ascending: false })

  if (billErr) return { payRows, billRows: [], error: billErr.message }

  const todayYmd = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const asOf = todayYmd()
  const billDataFiltered = (billData ?? []).filter((r) => {
    const ct = String((r as { contract_type?: string | null }).contract_type ?? '')
    if (ct === WEEKLY_HOURS_CONTRACT_TYPE) return false
    return patientServiceContractOverlapsDate(r as PatientServiceContractRow, asOf)
  })

  const patientIds = Array.from(new Set(billDataFiltered.map((r) => r.patient_id)))
  const { data: pats } =
    patientIds.length > 0
      ? await supabase.from('patients').select('id, full_name').in('id', patientIds)
      : { data: [] as { id: string; full_name: string | null }[] }

  const patientName = new Map((pats ?? []).map((p) => [p.id, p.full_name ?? 'Client']))

  const billRows: RateManagerBillRow[] = billDataFiltered.map((r) => ({
    id: r.id as string,
    patient_id: r.patient_id as string,
    clientName: patientName.get(r.patient_id as string) ?? 'Client',
    contract_name: (r.contract_name as string | null) ?? null,
    contract_type: String(r.contract_type ?? ''),
    service_type: String(r.service_type ?? ''),
    bill_rate: r.bill_rate != null ? Number(r.bill_rate) : null,
    bill_unit_type: String(r.bill_unit_type ?? 'hour'),
    effective_date: String(r.effective_date ?? ''),
  }))

  return { payRows, billRows }
}

/** Append a new caregiver pay rate row (closes the previous open row on the effective date). */
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

export async function updatePatientServiceContractBillRateAction(
  id: string,
  bill_rate: number
): Promise<{ ok?: true; error?: string }> {
  if (!Number.isFinite(bill_rate) || bill_rate < 0) return { error: 'Invalid bill rate.' }
  const supabase = await createClient()
  const {
    data: contract,
    error: contractErr,
  } = await supabase
    .from('patient_service_contracts')
    .select('id, agency_id, patient_id, service_type, bill_rate, bill_unit_type, effective_date, end_date')
    .eq('id', id)
    .single()
  if (contractErr || !contract) return { error: contractErr?.message || 'Contract not found.' }

  const visitQuery = supabase
    .from('scheduled_visits')
    .select('id, agency_id, patient_id, caregiver_member_id, visit_date, scheduled_start_time, scheduled_end_time')
    .eq('status', 'completed')
    .eq('patient_id', contract.patient_id)
    .eq('service_type', contract.service_type)
    .gte('visit_date', contract.effective_date)
  const { data: scopedVisits, error: visitsErr } = contract.end_date
    ? await visitQuery.lte('visit_date', contract.end_date)
    : await visitQuery
  if (visitsErr) return { error: visitsErr.message }

  const visitIds = (scopedVisits ?? []).map((v) => v.id as string)
  const { data: financeRows, error: financeErr } = visitIds.length
    ? await supabase
        .from('visit_financials')
        .select('scheduled_visit_id, status, approved_billable_hours, bill_rate')
        .in('scheduled_visit_id', visitIds)
    : { data: [], error: null as { message?: string } | null }
  if (financeErr) return { error: financeErr.message }
  const finByVisitId = new Map(
    (financeRows ?? []).map((r) => [String((r as { scheduled_visit_id: string }).scheduled_visit_id), r as Record<string, unknown>])
  )
  const nonPendingVisits = (scopedVisits ?? []).filter((v) => {
    const fin = finByVisitId.get(String(v.id))
    const st = String((fin as { status?: string | null } | undefined)?.status ?? 'pending').toLowerCase()
    return st === 'approved' || st === 'voided'
  })
  const withNoFrozen = nonPendingVisits.filter((v) => {
    const fin = finByVisitId.get(String(v.id))
    return (fin as { bill_rate?: number | null } | undefined)?.bill_rate == null
  })
  if (withNoFrozen.length > 0) {
    const toMinutes = (t: string | null | undefined) => {
      if (!t) return NaN
      const [h, m] = String(t).slice(0, 5).split(':').map((x) => parseInt(x, 10))
      if (!Number.isFinite(h)) return NaN
      return h * 60 + (Number.isFinite(m) ? m : 0)
    }
    for (const v of withNoFrozen) {
      const a = toMinutes(v.scheduled_start_time as string | null)
      const b = toMinutes(v.scheduled_end_time as string | null)
      const scheduleHours = !Number.isFinite(a) || !Number.isFinite(b) || b <= a ? 0 : Math.round((((b - a) / 60) + Number.EPSILON) * 100) / 100
      const fin = finByVisitId.get(String(v.id))
      const bh = (fin as { approved_billable_hours?: number | null } | undefined)?.approved_billable_hours != null
        ? Number((fin as { approved_billable_hours?: number | null }).approved_billable_hours)
        : NaN
      const hours = Number.isFinite(bh) ? bh : scheduleHours
      const unit = String(contract.bill_unit_type ?? 'hour')
      const rate = Number(contract.bill_rate ?? 0)
      const amount =
        unit === 'visit'
          ? rate
          : unit === '15_min_unit'
            ? rate * Math.round(hours * 4)
            : rate * hours
      const { error: snapErr } = await supabase
        .from('visit_financials')
        .update({
          status:
            String((fin as { status?: string | null } | undefined)?.status ?? '').toLowerCase() === 'voided'
              ? 'voided'
              : 'approved',
          bill_rate: rate,
          bill_amount: Math.round((amount + Number.EPSILON) * 100) / 100,
          updated_at: new Date().toISOString(),
        })
        .eq('scheduled_visit_id', v.id as string)
      if (snapErr) return { error: snapErr.message }
    }
  }

  if (visitIds.length > 0) {
    const [{ data: existingFinancialRows, error: finSelErr }, { data: timeEntries, error: timeEntryErr }] = await Promise.all([
      supabase.from('visit_financials').select('scheduled_visit_id').in('scheduled_visit_id', visitIds),
      supabase.from('visit_time_entries').select('id, scheduled_visit_id').in('scheduled_visit_id', visitIds),
    ])
    if (finSelErr) return { error: finSelErr.message }
    if (timeEntryErr) return { error: timeEntryErr.message }

    const existing = new Set((existingFinancialRows ?? []).map((r) => r.scheduled_visit_id as string))
    const timeEntryByVisitId = new Map((timeEntries ?? []).map((r) => [r.scheduled_visit_id as string, r.id as string]))
    const toInsert = nonPendingVisits
      .filter((v) => !existing.has(v.id as string))
      .map((v) => {
        const teId = timeEntryByVisitId.get(v.id as string)
        if (!teId) return null
        const toMinutes = (t: string | null | undefined) => {
          if (!t) return NaN
          const [h, m] = String(t).slice(0, 5).split(':').map((x) => parseInt(x, 10))
          if (!Number.isFinite(h)) return NaN
          return h * 60 + (Number.isFinite(m) ? m : 0)
        }
        const hoursFromSchedule = (() => {
          const a = toMinutes(v.scheduled_start_time as string | null)
          const b = toMinutes(v.scheduled_end_time as string | null)
          if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
          return Math.round((((b - a) / 60) + Number.EPSILON) * 100) / 100
        })()
        const fin = finByVisitId.get(String(v.id))
        const hoursRaw = (fin as { approved_billable_hours?: number | null } | undefined)?.approved_billable_hours != null
          ? Number((fin as { approved_billable_hours?: number | null }).approved_billable_hours)
          : NaN
        const hours = Number.isFinite(hoursRaw) ? hoursRaw : hoursFromSchedule
        const unit = String(contract.bill_unit_type ?? 'hour')
        const rate = Number(contract.bill_rate ?? 0)
        const billAmount =
          unit === 'visit'
            ? rate
            : unit === '15_min_unit'
              ? rate * Math.round(hours * 4)
              : rate * hours
        return {
          agency_id: (v.agency_id as string) ?? (contract.agency_id as string),
          scheduled_visit_id: v.id as string,
          visit_time_entry_id: teId,
          patient_id: v.patient_id as string,
          caregiver_member_id: (v.caregiver_member_id as string) ?? '',
          contract_id: contract.id as string,
          service_type: contract.service_type as string,
          status: 'approved',
          coordinator_note: null,
          pay_rate: 0,
          pay_amount: 0,
          bill_rate: rate,
          bill_amount: Math.round((billAmount + Number.EPSILON) * 100) / 100,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && !!x.caregiver_member_id)

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from('visit_financials')
        .upsert(toInsert, { onConflict: 'scheduled_visit_id' })
      if (insErr) return { error: insErr.message }
    }
  }

  const { error } = await supabase
    .from('patient_service_contracts')
    .update({ bill_rate, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(REPORT_PATH)
  revalidatePath('/pages/agency/time-billing')
  return { ok: true }
}
