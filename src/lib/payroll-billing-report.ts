import type { Supabase } from '@/lib/supabase/types'
import { resolvePayRateForVisit, type CaregiverPayRateRow } from '@/lib/caregiver-pay-rates'
import type { PatientServiceContractRow } from '@/lib/supabase/query/patient-service-contracts'
import {
  patientServiceContractOverlapsDate,
  sortPatientServiceContractsByRecency,
  WEEKLY_HOURS_CONTRACT_TYPE,
} from '@/lib/patient-service-contract-effective'

export type PayrollBillingDetailRow = {
  id: string
  clientId: string
  caregiverId: string
  clientName: string
  caregiverName: string
  serviceTypeLabel: string
  visitDate: string
  startTime: string
  endTime: string
  actualHours: number
  billableHours: number

  // Pay breakdown (what the agency pays the caregiver)
  regHours: number
  otHours: number
  holidayHours: number
  weekendHours: number
  regPay: number
  otPay: number
  holidayPay: number
  weekendPay: number
  mileageMiles: number
  mileagePayAmount: number   // caregiver mileage reimbursement

  // Totals (kept for backward compat with existing UI)
  payRate: number
  payAmount: number          // = regPay + otPay + holidayPay + weekendPay + mileagePayAmount

  // Client billing
  billRate: number
  mileageBillAmount: number  // added to client bill only when contract.bill_mileage = true
  billAmount: number         // = hours bill + mileageBillAmount

  billingState: 'approved' | 'pending' | 'voided'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHHMM(t: string | null): string {
  if (!t) return '--:--'
  return String(t).slice(0, 5)
}

function hoursFromSchedule(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const toMinutes = (raw: string) => {
    const s = String(raw).trim()
    const parts = s.split(':').map((x) => parseInt(x, 10))
    const h = parts[0]
    const m = parts[1]
    if (!Number.isFinite(h)) return NaN
    return h * 60 + (Number.isFinite(m) ? m : 0)
  }
  const a = toMinutes(start)
  const b = toMinutes(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return round2((b - a) / 60)
}

function calcAmount(hours: number, rate: number, unit: string | null | undefined): number {
  if (!Number.isFinite(hours) || !Number.isFinite(rate)) return 0
  if (unit === 'visit') return rate
  if (unit === '15_min_unit') return rate * Math.round(hours * 4)
  return rate * hours
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function serviceTypeLabelFn(serviceType: string, visitType: string | null | undefined): string {
  const vt = visitType?.trim()
  if (vt) return vt
  return serviceType === 'skilled' ? 'Skilled' : 'HHA/CNA'
}

/** Return the Monday-week start ISO date key for a given visit date and agency work week start (0=Sun). */
function getWeekKey(caregiverId: string, visitDate: string, weekStart: number): string {
  const d = new Date(visitDate + 'T12:00:00')
  const dow = d.getDay() // 0=Sun
  const daysBack = (dow - weekStart + 7) % 7
  const weekStartDate = new Date(d)
  weekStartDate.setDate(d.getDate() - daysBack)
  return `${caregiverId}__${weekStartDate.toISOString().slice(0, 10)}`
}

type HolidayEntry = { name?: string; date?: string; rate_multiplier?: number }

type AgencyConfig = {
  work_week_start?: number | null
  allow_weekends?: boolean | null
  weekend_rate_multiplier?: number | null
  overtime_threshold_weekly?: number | null
  overtime_rate_multiplier?: number | null
  holidays?: HolidayEntry[] | null
  mileage_reimbursement_enabled?: boolean | null
  mileage_reimbursement_start_date?: string | null
  mileage_rate_per_mile?: number | null
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchPayrollBillingReportRows(
  supabase: Supabase,
  params: { agencyId: string | null; dateFrom: string; dateTo: string }
): Promise<{ rows: PayrollBillingDetailRow[]; error?: string }> {
  const { agencyId, dateFrom, dateTo } = params

  // Fetch agency config for payroll rules and mileage settings
  const { data: agencyConfig } = agencyId
    ? await supabase
        .from('agency_configurations')
        .select('*')
        .eq('agency_id', agencyId)
        .maybeSingle()
    : { data: null }
  const config = (agencyConfig ?? {}) as AgencyConfig

  let visitQuery = supabase
    .from('scheduled_visits')
    .select(
      'id, agency_id, patient_id, caregiver_member_id, visit_date, scheduled_start_time, scheduled_end_time, service_type, visit_type, mileage_miles'
    )
    .eq('status', 'completed')
    .gte('visit_date', dateFrom)
    .lte('visit_date', dateTo)
    .order('visit_date', { ascending: true })
    .order('scheduled_start_time', { ascending: true })

  if (agencyId) visitQuery = visitQuery.eq('agency_id', agencyId)

  const { data: visits, error: visitsErr } = await visitQuery
  if (visitsErr) return { rows: [], error: visitsErr.message }

  const visitList = visits ?? []
  if (visitList.length === 0) return { rows: [] }

  const patientIds = Array.from(new Set(visitList.map((v) => v.patient_id)))
  const caregiverIds = Array.from(
    new Set(visitList.flatMap((v) => (v.caregiver_member_id ? [v.caregiver_member_id] : [])))
  )
  const visitIds = visitList.map((v) => v.id as string)

  const [patRes, cgRes, contractsRes, caregiverPayRes, financialsRes, approvalsRes, tasksRes] = await Promise.all([
    supabase.from('patients').select('id, full_name').in('id', patientIds),
    caregiverIds.length
      ? supabase.from('caregiver_members').select('id, first_name, last_name').in('id', caregiverIds)
      : Promise.resolve({ data: [], error: null } as const),
    supabase
      .from('patient_service_contracts')
      .select(
        'id, patient_id, contract_type, service_type, bill_rate, bill_unit_type, effective_date, end_date, status, created_at, updated_at, bill_mileage, mileage_bill_rate_per_mile'
      )
      .in('patient_id', patientIds),
    caregiverIds.length
      ? supabase
          .from('caregiver_pay_rates')
          .select('caregiver_member_id, pay_rate, unit_type, service_type, effective_start, effective_end')
          .in('caregiver_member_id', caregiverIds)
      : Promise.resolve({ data: [], error: null } as const),
    visitIds.length
      ? supabase
          .from('visit_financials')
          .select(
            'scheduled_visit_id, service_type, status, pay_rate, pay_amount, bill_rate, bill_amount, approved_billable_hours, approved_actual_hours, pay_unit_type, bill_unit_type'
          )
          .in('scheduled_visit_id', visitIds)
      : Promise.resolve({ data: [], error: null } as const),
    visitIds.length
      ? supabase
          .from('visit_approvals')
          .select('scheduled_visit_id, approval_status, approved_billable_hours, approved_actual_hours, pay_rate, bill_rate')
          .in('scheduled_visit_id', visitIds)
      : Promise.resolve({ data: [], error: null } as const),
    visitIds.length
      ? supabase
          .from('scheduled_visit_tasks')
          .select('scheduled_visit_id, task_id, sort_order')
          .in('scheduled_visit_id', visitIds)
          .not('task_id', 'is', null)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
  ])

  if (patRes.error) return { rows: [], error: patRes.error.message }
  if (cgRes.error) return { rows: [], error: cgRes.error.message }
  if (contractsRes.error) return { rows: [], error: contractsRes.error.message }
  if (caregiverPayRes.error) return { rows: [], error: caregiverPayRes.error.message }
  if (financialsRes.error) return { rows: [], error: financialsRes.error.message }
  if (approvalsRes.error) return { rows: [], error: approvalsRes.error.message }
  if (tasksRes.error) return { rows: [], error: tasksRes.error.message }

  const patientNameById = new Map((patRes.data ?? []).map((r) => [r.id, r.full_name ?? 'Client']))
  const caregiverNameById = new Map(
    (cgRes.data ?? []).map((r) => [r.id, [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Caregiver'])
  )
  const contracts = contractsRes.data ?? []
  const caregiverPayRows = (caregiverPayRes.data ?? []) as CaregiverPayRateRow[]

  type FinancialRow = {
    scheduled_visit_id: string; service_type?: string | null; status?: string | null
    pay_rate: number | null; pay_amount: number | null; bill_rate: number | null; bill_amount: number | null
    approved_billable_hours?: number | null; approved_actual_hours?: number | null
    pay_unit_type?: string | null; bill_unit_type?: string | null
  }
  const financialByVisitId = new Map(((financialsRes.data ?? []) as FinancialRow[]).map((r) => [r.scheduled_visit_id, r]))

  type ApprovalRow = {
    scheduled_visit_id: string; approval_status?: string | null
    approved_billable_hours?: number | null; approved_actual_hours?: number | null
    pay_rate?: number | null; bill_rate?: number | null
  }
  const approvalByVisitId = new Map(((approvalsRes.data ?? []) as ApprovalRow[]).map((r) => [r.scheduled_visit_id, r]))

  const firstTaskByVisitId = new Map<string, string>()
  for (const tr of tasksRes.data ?? []) {
    const vid = String((tr as { scheduled_visit_id: string }).scheduled_visit_id)
    const tid = (tr as { task_id?: string | null }).task_id
    if (tid && !firstTaskByVisitId.has(vid)) firstTaskByVisitId.set(vid, tid)
  }

  const pickContract = (patientId: string, serviceType: string, date: string) => {
    const rows = (contracts as PatientServiceContractRow[]).filter(
      (c) =>
        c.patient_id === patientId &&
        c.service_type === serviceType &&
        c.contract_type !== WEEKLY_HOURS_CONTRACT_TYPE &&
        patientServiceContractOverlapsDate(c, date)
    )
    if (rows.length === 0) return undefined
    return [...rows].sort(sortPatientServiceContractsByRecency)[0]
  }

  // Build holiday lookup: date string → rate multiplier
  const holidayRateByDate = new Map<string, number>()
  for (const h of (config.holidays ?? []) as HolidayEntry[]) {
    if (h.date && h.rate_multiplier) holidayRateByDate.set(h.date, h.rate_multiplier)
  }

  const weekStart = config.work_week_start ?? 0
  const otThreshold = config.overtime_threshold_weekly ?? 40
  const otMultiplier = config.overtime_rate_multiplier ?? 1.5
  const weekendMultiplier = config.weekend_rate_multiplier ?? null

  // Accumulates actual hours per (caregiver, work-week) for OT calculation
  const weeklyHoursAccum = new Map<string, number>()

  const rows: PayrollBillingDetailRow[] = visitList
    .filter((sv) => financialByVisitId.has(String(sv.id)) || approvalByVisitId.has(String(sv.id)))
    .map((sv) => {
      const visitDate = sv.visit_date ?? ''
      const financial = financialByVisitId.get(sv.id as string)
      const approval = approvalByVisitId.get(sv.id as string)
      const serviceType = ((financial?.service_type ?? sv.service_type) === 'skilled' ? 'skilled' : 'non_skilled') as 'non_skilled' | 'skilled'
      const caregiverId = sv.caregiver_member_id ?? ''
      const scheduleHours = hoursFromSchedule(sv.scheduled_start_time, sv.scheduled_end_time)

      const bh = financial?.approved_billable_hours != null ? Number(financial.approved_billable_hours) : NaN
      const abh = approval?.approved_billable_hours != null ? Number(approval.approved_billable_hours) : NaN
      const fallbackBillable = Number.isFinite(bh) ? round2(bh) : Number.isFinite(abh) ? round2(abh) : scheduleHours
      const aah = financial?.approved_actual_hours != null ? Number(financial.approved_actual_hours) : NaN
      const aa2 = approval?.approved_actual_hours != null ? Number(approval.approved_actual_hours) : NaN
      const fallbackActual = Number.isFinite(aah) ? round2(aah) : Number.isFinite(aa2) ? round2(aa2) : scheduleHours > 0 ? round2(scheduleHours) : fallbackBillable

      const fs = String(financial?.status ?? '').toLowerCase()
      const as_ = String(approval?.approval_status ?? '').toLowerCase()
      const billingState: 'approved' | 'pending' | 'voided' =
        as_ === 'approved' || fs === 'approved' ? 'approved' : fs === 'voided' ? 'voided' : 'pending'

      const pay = caregiverId && visitDate ? resolvePayRateForVisit(caregiverId, serviceType, visitDate, caregiverPayRows) : null
      const contract = sv.patient_id && visitDate ? pickContract(sv.patient_id, serviceType, visitDate) : null
      const useFrozenSnapshot = financial != null && Number.isFinite(Number(financial.bill_rate ?? NaN))
      const useApprovalSnapshot = approval != null && Number.isFinite(Number(approval.bill_rate ?? NaN))

      let billableHours = fallbackBillable
      let actualHours = fallbackActual
      let payRate = Number(pay?.rate ?? 0)
      let billRate = Number(contract?.bill_rate ?? 0)
      let hoursBillAmount = round2(calcAmount(billableHours, billRate, contract?.bill_unit_type))

      if (useFrozenSnapshot && financial) {
        const fbh = financial.approved_billable_hours != null ? Number(financial.approved_billable_hours) : NaN
        const fah = financial.approved_actual_hours != null ? Number(financial.approved_actual_hours) : NaN
        if (Number.isFinite(fbh)) billableHours = round2(fbh)
        if (Number.isFinite(fah)) actualHours = round2(fah)
        else if (scheduleHours > 0) actualHours = round2(scheduleHours)
        payRate = Number(financial.pay_rate ?? 0)
        billRate = Number(financial.bill_rate ?? 0)
        hoursBillAmount = round2(Number(financial.bill_amount ?? 0))
      } else if (useApprovalSnapshot && approval) {
        payRate = Number(approval.pay_rate ?? 0)
        billRate = Number(approval.bill_rate ?? 0)
        hoursBillAmount = round2(calcAmount(billableHours, billRate, contract?.bill_unit_type))
      }

      // ── Pay type classification ──────────────────────────────────────────
      const holidayRate = holidayRateByDate.get(visitDate)
      const isHoliday = holidayRate != null
      const dow = new Date(visitDate + 'T12:00:00').getDay() // 0=Sun 6=Sat
      const isWeekend = (dow === 0 || dow === 6) && weekendMultiplier != null

      let regHours = 0, otHours = 0, holidayHours = 0, weekendHours = 0
      let regPay = 0, otPay = 0, holidayPay = 0, weekendPay = 0

      if (isHoliday) {
        holidayHours = actualHours
        holidayPay = round2(actualHours * payRate * (holidayRate ?? 1))
      } else if (isWeekend) {
        weekendHours = actualHours
        weekendPay = round2(actualHours * payRate * (weekendMultiplier ?? 1))
      } else {
        // Regular day — split into REG and OT using weekly accumulator
        const weekKey = getWeekKey(caregiverId || 'unknown', visitDate, weekStart)
        const accumulated = weeklyHoursAccum.get(weekKey) ?? 0
        const regPortion = Math.max(0, Math.min(actualHours, otThreshold - accumulated))
        const otPortion = Math.max(0, actualHours - regPortion)
        regHours = regPortion
        otHours = otPortion
        regPay = round2(regPortion * payRate)
        otPay = round2(otPortion * payRate * otMultiplier)
        weeklyHoursAccum.set(weekKey, accumulated + actualHours)
      }

      // ── Mileage ──────────────────────────────────────────────────────────
      const miles = Number((sv as { mileage_miles?: number | null }).mileage_miles ?? 0)

      const mileageEnabled =
        config.mileage_reimbursement_enabled === true &&
        config.mileage_rate_per_mile != null &&
        (!config.mileage_reimbursement_start_date || visitDate >= config.mileage_reimbursement_start_date)
      const mileagePayAmount = mileageEnabled ? round2(miles * config.mileage_rate_per_mile!) : 0

      const contractBillsMileage = (contract as PatientServiceContractRow & { bill_mileage?: boolean })?.bill_mileage === true
      const mileageBillRate = (contract as PatientServiceContractRow & { mileage_bill_rate_per_mile?: number | null })?.mileage_bill_rate_per_mile ?? config.mileage_rate_per_mile ?? 0
      const mileageBillAmount = contractBillsMileage && miles > 0 ? round2(miles * Number(mileageBillRate)) : 0

      const payAmount = round2(regPay + otPay + holidayPay + weekendPay + mileagePayAmount)
      const billAmount = round2(hoursBillAmount + mileageBillAmount)

      const vt = (sv as { visit_type?: string | null }).visit_type

      return {
        id: sv.id as string,
        clientId: sv.patient_id as string,
        caregiverId,
        clientName: patientNameById.get(sv.patient_id) ?? 'Client',
        caregiverName: caregiverId ? (caregiverNameById.get(caregiverId) ?? 'Caregiver') : '—',
        serviceTypeLabel: serviceTypeLabelFn(serviceType, vt ?? null),
        visitDate,
        startTime: toHHMM(sv.scheduled_start_time),
        endTime: toHHMM(sv.scheduled_end_time),
        actualHours,
        billableHours,
        regHours,
        otHours,
        holidayHours,
        weekendHours,
        regPay,
        otPay,
        holidayPay,
        weekendPay,
        mileageMiles: miles,
        mileagePayAmount,
        payRate,
        payAmount,
        billRate,
        mileageBillAmount,
        billAmount,
        billingState,
      }
    })

  return { rows }
}
