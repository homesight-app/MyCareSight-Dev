'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Supabase } from '@/lib/supabase/types'
import {
  clearVisitApprovalAndFinancialsOnVoid,
  syncVisitApprovalAndFinancialsOnApprove,
} from '@/lib/visit-approval-financials'
import type { PatientServiceContractRow } from '@/lib/supabase/query/patient-service-contracts'
import {
  patientServiceContractOverlapsDate,
  sortPatientServiceContractsByRecency,
  WEEKLY_HOURS_CONTRACT_TYPE,
} from '@/lib/patient-service-contract-effective'

const PATH = '/pages/agency/time-billing'
const REPORT_PAYROLL_PATH = '/pages/agency/reports/payroll-billing'

type PendingPayload = {
  scheduledVisitId: string
  actualHours: number
  billableHours: number
  note: string
  serviceType: 'non_skilled' | 'skilled'
}

async function applyTimeBillingVisitUpdate(
  supabase: Supabase,
  userId: string | null,
  input: PendingPayload,
  billingState: 'approved' | 'voided'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actualHours = Number(input.actualHours)
  const billableHours = Number(input.billableHours)
  if (!Number.isFinite(actualHours) || actualHours < 0 || !Number.isFinite(billableHours) || billableHours < 0) {
    return { ok: false, error: 'Actual/Billable hours must be valid numbers.' }
  }

  const { data: sv, error: svErr } = await supabase
    .from('scheduled_visits')
    .select(
      'id, agency_id, caregiver_member_id, patient_id, visit_date, scheduled_start_time, scheduled_end_time'
    )
    .eq('id', input.scheduledVisitId)
    .single()

  if (svErr || !sv) {
    return { ok: false, error: svErr?.message || 'Visit not found.' }
  }

  const visit = sv as {
    id: string
    agency_id: string
    caregiver_member_id: string | null
    patient_id: string
    visit_date: string
    scheduled_start_time?: string | null
    scheduled_end_time?: string | null
  }

  if (!visit.caregiver_member_id) {
    return {
      ok: false,
      error: 'This visit has no assigned caregiver. Assign a caregiver before approving hours.',
    }
  }

  const note = input.note?.trim() ? input.note.trim() : null
  const visitDate = String(visit.visit_date ?? '')

  const { data: contractRows } = await supabase
    .from('patient_service_contracts')
    .select(
      'id, bill_rate, bill_unit_type, billing_code_id, effective_date, end_date, status, contract_type, created_at, updated_at'
    )
    .eq('patient_id', visit.patient_id)
    .eq('service_type', input.serviceType)
    .neq('contract_type', WEEKLY_HOURS_CONTRACT_TYPE)

  const contractCandidates = ((contractRows ?? []) as PatientServiceContractRow[]).filter((c) =>
    patientServiceContractOverlapsDate(c, visitDate)
  )
  const contract =
    contractCandidates.length === 0
      ? null
      : [...contractCandidates].sort(sortPatientServiceContractsByRecency)[0]

  if (billingState === 'approved') {
    if (!userId) {
      return { ok: false, error: 'You must be signed in to approve hours.' }
    }
    const sync = await syncVisitApprovalAndFinancialsOnApprove({
      supabase,
      approvedByUserId: userId,
      visit: {
        id: visit.id,
        agency_id: visit.agency_id,
        patient_id: visit.patient_id,
        caregiver_member_id: visit.caregiver_member_id,
        visit_date: visit.visit_date,
        scheduled_start_time: visit.scheduled_start_time,
        scheduled_end_time: visit.scheduled_end_time,
      },
      actualHours,
      billableHours,
      serviceType: input.serviceType,
      contract: contract
        ? {
            id: String(contract.id),
            bill_rate: contract.bill_rate != null ? Number(contract.bill_rate) : null,
            bill_unit_type: contract.bill_unit_type != null ? String(contract.bill_unit_type) : null,
            billing_code_id: (contract as { billing_code_id?: string | null }).billing_code_id ?? null,
          }
        : null,
      note,
    })
    if (!sync.ok) return sync
  }

  if (billingState === 'voided' && userId) {
    const cleared = await clearVisitApprovalAndFinancialsOnVoid({
      supabase,
      voidedByUserId: userId,
      visit: {
        id: visit.id,
        agency_id: visit.agency_id,
        patient_id: visit.patient_id,
        caregiver_member_id: visit.caregiver_member_id,
        visit_date: visit.visit_date,
        scheduled_start_time: visit.scheduled_start_time,
        scheduled_end_time: visit.scheduled_end_time,
      },
      note,
    })
    if (!cleared.ok) return cleared
  } else if (billingState === 'voided') {
    return { ok: false, error: 'You must be signed in to void hours.' }
  }

  return { ok: true }
}

export async function approveTimeBillingRowAction(input: PendingPayload) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const result = await applyTimeBillingVisitUpdate(supabase, user?.id ?? null, input, 'approved')
  if (!result.ok) return { error: result.error }
  revalidatePath(PATH)
  revalidatePath(REPORT_PAYROLL_PATH)
  return { ok: true }
}

export async function voidTimeBillingRowAction(input: PendingPayload) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const result = await applyTimeBillingVisitUpdate(supabase, user?.id ?? null, input, 'voided')
  if (!result.ok) return { error: result.error }
  revalidatePath(PATH)
  revalidatePath(REPORT_PAYROLL_PATH)
  return { ok: true }
}

export async function updateVisitMileageAction(
  scheduledVisitId: string,
  mileageMiles: number | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Read current value for audit log
  const { data: current } = await supabase
    .from('scheduled_visits')
    .select('mileage_miles')
    .eq('id', scheduledVisitId)
    .single()

  const { error } = await supabase
    .from('scheduled_visits')
    .update({ mileage_miles: mileageMiles })
    .eq('id', scheduledVisitId)

  if (error) return { ok: false, error: error.message }

  const { error: auditMileageErr } = await supabase.from('audit_log').insert({
    table_name: 'scheduled_visits',
    record_id: scheduledVisitId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: {
      old_values: { mileage_miles: current?.mileage_miles ?? null },
      new_values: { mileage_miles: mileageMiles },
    },
  })
  if (auditMileageErr) console.error('[time-billing/mileage] Audit log UPDATE failed. visitId=%s err=%s', scheduledVisitId, auditMileageErr.message)

  revalidatePath(PATH)
  revalidatePath(REPORT_PAYROLL_PATH)
  return { ok: true }
}
