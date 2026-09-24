'use server'

import { revalidatePath } from 'next/cache'
import sql from '@/db'
import { requireCaregiverPayRates } from '@/lib/repositories/caregiver-pay-rates'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'
import { savePatientServiceContractBillRates } from '@/lib/repositories/financial-maintenance'
import { appendCaregiverPayRateAction } from '@/app/actions/caregiver-pay-rates'
import { fetchPayrollBillingReportRows, type PayrollBillingDetailRow } from '@/lib/payroll-billing-report'
import type { PatientServiceContractRow } from '@/lib/supabase/query/patient-service-contracts'
import {
  patientServiceContractOverlapsDate,
  WEEKLY_HOURS_CONTRACT_TYPE,
} from '@/lib/patient-service-contract-effective'
import { patientFullName } from '@/lib/patient-name'
import { billRateBatchSchema, financialReportRangeSchema, type BillRateBatchInput } from '@/lib/schemas/financial-maintenance'

const REPORT_PATH = '/pages/agency/reports/payroll-billing'

export async function getPayrollBillingReportRowsAction(
  dateFrom: string,
  dateTo: string
): Promise<{ rows: PayrollBillingDetailRow[]; error?: string }> {
  const parsed = financialReportRangeSchema.safeParse({ dateFrom, dateTo })
  if (!parsed.success) return { rows: [], error: parsed.error.issues[0]?.message ?? 'Invalid date range.' }
  try {
    return await withAgencyManagerFinancialRead(async actor => {
      const result = await fetchPayrollBillingReportRows({ agencyId: actor.agencyId, ...parsed.data })
      if (result.error) return result
      await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES(${actor.agencyId}::uuid,'scheduled_visits',NULL,'READ',${actor.id}::uuid,
          ${JSON.stringify({ operation: 'payroll_billing_report', date_from: parsed.data.dateFrom,
            date_to: parsed.data.dateTo, result_count: result.rows.length })}::jsonb)`
      return result
    })
  } catch { return { rows: [], error: 'Unable to load the report.' } }
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
  try {
    return await withAgencyManagerFinancialRead(async actor => {
      const result = await _getRateManagerData(actor.agencyId)
      if (result.error) return result
      await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES(${actor.agencyId}::uuid,'patient_service_contracts',NULL,'READ',${actor.id}::uuid,
          ${JSON.stringify({ operation: 'rate_manager', pay_rate_count: result.payRows.length,
            bill_rate_count: result.billRows.length })}::jsonb)`
      return result
    })
  } catch { return { payRows: [], billRows: [], error: 'Unable to load rates.' } }
}

async function _getRateManagerData(
  agencyId: string
): Promise<{ payRows: RateManagerPayRow[]; billRows: RateManagerBillRow[]; error?: string }> {

  let payData: PayRateRow[]
  try {
    payData = await requireCaregiverPayRates({ agencyId, openOnly: true })
  } catch (err) {
    return { payRows: [], billRows: [], error: err instanceof Error ? err.message : 'Failed to load pay rates' }
  }

  const cgIds = Array.from(new Set(payData.map(r => r.caregiver_member_id).filter(Boolean))) as string[]
  let nameByCg = new Map<string, string>()
  if (cgIds.length) {
    const cgs = await sql<CaregiverNameRow[]>`SELECT id, first_name, last_name FROM caregiver_members
      WHERE agency_id=${agencyId}::uuid AND id = ANY(${cgIds}::uuid[])`
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
    pats = await sql<PatientNameRow[]>`SELECT id, first_name, last_name FROM patients
      WHERE agency_id=${agencyId}::uuid AND id = ANY(${patientIds}::uuid[])`
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
  if (serviceType !== null && serviceType !== 'skilled' && serviceType !== 'non_skilled') return { error: 'Invalid service type' }
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
  const result = await savePatientServiceContractBillRates({ rates: [{ contractId: id, billRate: bill_rate }] })
  if (!result.success) return { error: result.error }
  revalidatePath(REPORT_PATH)
  revalidatePath('/pages/agency/time-billing')
  return { ok: true }
}

export async function savePatientServiceContractBillRatesAction(
  input: BillRateBatchInput
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
  const parsed = billRateBatchSchema.safeParse(input)
  if (!parsed.success) {
    const fields: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || 'root'
      ;(fields[path] ??= []).push(issue.message)
    }
    return { success: false, error: 'Check the bill-rate fields.', fieldErrors: fields }
  }
  const result = await savePatientServiceContractBillRates(parsed.data)
  if (!result.success) return result
  revalidatePath(REPORT_PATH)
  revalidatePath('/pages/agency/time-billing')
  return { success: true }
}
