/**
 * Persists coordinator Time & Billing decisions to visit_approvals, visit_financials,
 * and visit_adjustment_history (audit trail). Reports should read frozen rows from visit_financials.
 */

import 'server-only'

import sql from '@/db'
import {
  resolvePayRateForVisit,
  type CaregiverPayRateRow,
} from '@/lib/caregiver-pay-rates'

export type VisitRowForBillingApproval = {
  id: string
  agency_id: string
  patient_id: string
  caregiver_member_id: string | null
  visit_date: string
  scheduled_start_time?: string | null
  scheduled_end_time?: string | null
}

type ContractPick = {
  id: string
  bill_rate: number | null
  bill_unit_type: string | null
  billing_code_id?: string | null
} | null

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function calcAmount(hours: number, rate: number, unit: string | null | undefined): number {
  if (!Number.isFinite(hours) || !Number.isFinite(rate)) return 0
  if (unit === 'visit') return rate
  if (unit === '15_min_unit') return rate * Math.round(hours * 4)
  return rate * hours
}

export async function ensureVisitTimeEntryForBilling(
  visit: VisitRowForBillingApproval
): Promise<{ id: string } | { error: string }> {
  if (!visit.caregiver_member_id) return { error: 'Visit has no assigned caregiver.' }

  try {
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM visit_time_entries WHERE scheduled_visit_id = ${visit.id} LIMIT 1
    `
    if (existing?.id) return { id: String(existing.id) }

    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO visit_time_entries ${sql({
        agency_id: visit.agency_id,
        scheduled_visit_id: visit.id,
        patient_id: visit.patient_id,
        caregiver_member_id: visit.caregiver_member_id,
        entry_status: 'submitted',
      })} RETURNING id
    `
    if (!inserted) return { error: 'Could not create visit time entry.' }
    return { id: String(inserted.id) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create visit time entry.' }
  }
}

async function loadPayContext(
  caregiverMemberId: string
): Promise<{ caregiverPayRows: CaregiverPayRateRow[] }> {
  const rows = await sql<CaregiverPayRateRow[]>`
    SELECT caregiver_member_id, pay_rate, unit_type, service_type, effective_start, effective_end
    FROM caregiver_pay_rates
    WHERE caregiver_member_id = ${caregiverMemberId}
  `
  return { caregiverPayRows: rows }
}

export async function syncVisitApprovalAndFinancialsOnApprove(params: {
  approvedByUserId: string
  visit: VisitRowForBillingApproval
  actualHours: number
  billableHours: number
  serviceType: 'non_skilled' | 'skilled'
  contract: ContractPick
  note: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { approvedByUserId, visit, actualHours, billableHours, serviceType, contract, note } = params
  const approvedActualHours = round2(actualHours)
  const approvedBillableHours = round2(billableHours)

  const vte = await ensureVisitTimeEntryForBilling(visit)
  if ('error' in vte) return { ok: false, error: vte.error }
  const vteId = vte.id

  let caregiverPayRows: CaregiverPayRateRow[]
  try {
    ;({ caregiverPayRows } = await loadPayContext(visit.caregiver_member_id!))
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load pay rates.' }
  }

  const pay = resolvePayRateForVisit(
    visit.caregiver_member_id!,
    serviceType,
    visit.visit_date,
    caregiverPayRows
  )
  const resolvedPayRate = Number(pay?.rate ?? 0)
  const payUnit = (pay?.unit_type as string | null) ?? 'hour'
  const resolvedPayAmount = round2(calcAmount(approvedActualHours, resolvedPayRate, payUnit))

  const resolvedBillRate = Number(contract?.bill_rate ?? 0)
  const billUnit = String(contract?.bill_unit_type ?? 'hour')
  const resolvedBillAmount = round2(calcAmount(approvedBillableHours, resolvedBillRate, billUnit))

  try {
    const [prevFin] = await sql<{
      approved_billable_hours: number | null
      pay_amount: number | null
      bill_amount: number | null
      pay_rate: number | null
      bill_rate: number | null
      approved_actual_hours: number | null
    }[]>`
      SELECT approved_billable_hours, pay_amount, bill_amount, pay_rate, bill_rate, approved_actual_hours
      FROM visit_financials
      WHERE scheduled_visit_id = ${visit.id}
      LIMIT 1
    `

    const materiallyChanged =
      prevFin != null &&
      (round2(Number(prevFin.approved_billable_hours ?? 0)) !== approvedBillableHours ||
        round2(Number(prevFin.approved_actual_hours ?? 0)) !== approvedActualHours ||
        round2(Number(prevFin.pay_amount ?? 0)) !== resolvedPayAmount ||
        round2(Number(prevFin.bill_amount ?? 0)) !== resolvedBillAmount)

    const [existingApproval] = await sql<{
      id: string
      pay_rate: number | null
      bill_rate: number | null
    }[]>`
      SELECT id, pay_rate, bill_rate FROM visit_approvals
      WHERE visit_time_entry_id = ${vteId}
      LIMIT 1
    `

    const frozenPayRate =
      existingApproval?.pay_rate != null && Number.isFinite(Number(existingApproval.pay_rate))
        ? Number(existingApproval.pay_rate)
        : resolvedPayRate
    const frozenBillRate =
      existingApproval?.bill_rate != null && Number.isFinite(Number(existingApproval.bill_rate))
        ? Number(existingApproval.bill_rate)
        : resolvedBillRate
    const payAmount = round2(calcAmount(approvedActualHours, frozenPayRate, payUnit))
    const billAmount = round2(calcAmount(approvedBillableHours, frozenBillRate, billUnit))

    const snapshot = {
      previous: {
        approved_billable_hours: prevFin?.approved_billable_hours ?? null,
        approved_actual_hours: prevFin?.approved_actual_hours ?? null,
        pay_rate: prevFin?.pay_rate ?? null,
        pay_amount: prevFin?.pay_amount ?? null,
        bill_rate: prevFin?.bill_rate ?? null,
        bill_amount: prevFin?.bill_amount ?? null,
      },
      new: {
        approved_billable_hours: approvedBillableHours,
        approved_actual_hours: approvedActualHours,
        pay_rate: frozenPayRate,
        pay_amount: payAmount,
        bill_rate: frozenBillRate,
        bill_amount: billAmount,
      },
      materially_changed: materiallyChanged,
      coordinator_note: note,
    }

    await sql`
      INSERT INTO visit_adjustment_history ${sql({
        agency_id: visit.agency_id,
        visit_time_entry_id: vteId,
        changed_by_user_id: approvedByUserId,
        reason: prevFin ? 'coordinator_time_billing_update' : 'coordinator_time_billing_initial',
        comment: JSON.stringify(snapshot),
      })}
    `

    const approvalBase = {
      agency_id: visit.agency_id,
      scheduled_visit_id: visit.id,
      visit_time_entry_id: vteId,
      patient_id: visit.patient_id,
      caregiver_member_id: visit.caregiver_member_id!,
      approved_by_user_id: approvedByUserId,
      approval_status: 'approved',
      approved_actual_hours: approvedActualHours,
      approved_billable_hours: approvedBillableHours,
      approval_comment: note,
      pay_rate: frozenPayRate,
      bill_rate: frozenBillRate,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (existingApproval?.id) {
      await sql`UPDATE visit_approvals SET ${sql(approvalBase)} WHERE id = ${existingApproval.id}`
    } else {
      await sql`INSERT INTO visit_approvals ${sql(approvalBase)}`
    }

    await sql`DELETE FROM visit_financials WHERE scheduled_visit_id = ${visit.id}`

    await sql`
      UPDATE visit_time_entries SET ${sql({
        actual_hours: approvedActualHours,
        billable_hours: approvedBillableHours,
        entry_status: 'approved',
        adjustment_comment: note,
        updated_at: new Date().toISOString(),
      })} WHERE id = ${vteId}
    `

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to sync visit approval.' }
  }
}

export async function clearVisitApprovalAndFinancialsOnVoid(params: {
  voidedByUserId: string
  visit: VisitRowForBillingApproval
  note: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { voidedByUserId, visit, note } = params

  const vte = await ensureVisitTimeEntryForBilling(visit)
  if ('error' in vte) return { ok: false, error: vte.error }
  const vteId = vte.id

  try {
    const [prevFin] = await sql<{
      pay_amount: number | null
      bill_amount: number | null
      approved_billable_hours: number | null
    }[]>`
      SELECT pay_amount, bill_amount, approved_billable_hours
      FROM visit_financials
      WHERE scheduled_visit_id = ${visit.id}
      LIMIT 1
    `

    await sql`
      INSERT INTO visit_adjustment_history ${sql({
        agency_id: visit.agency_id,
        visit_time_entry_id: vteId,
        changed_by_user_id: voidedByUserId,
        reason: 'coordinator_void_billing',
        comment: JSON.stringify({ previous: prevFin ?? null, coordinator_note: note }),
      })}
    `

    const nowIso = new Date().toISOString()
    const voidedCalculationBasisJson = JSON.stringify({ voided: true, at: nowIso })

    const [existingFin] = await sql<{
      pay_rate: number | null
      pay_amount: number | null
      bill_rate: number | null
      bill_amount: number | null
      approved_actual_hours: number | null
      approved_billable_hours: number | null
      service_type: string | null
    }[]>`
      SELECT pay_rate, pay_amount, bill_rate, bill_amount, approved_actual_hours, approved_billable_hours, service_type
      FROM visit_financials
      WHERE scheduled_visit_id = ${visit.id}
      LIMIT 1
    `

    await sql`
      INSERT INTO visit_financials (
        agency_id, scheduled_visit_id, visit_time_entry_id, patient_id, caregiver_member_id,
        status, service_type, coordinator_note, pay_rate, pay_amount, bill_rate, bill_amount,
        approved_actual_hours, approved_billable_hours, visit_approval_id, calculation_basis, updated_at
      ) VALUES (
        ${visit.agency_id}, ${visit.id}, ${vteId}, ${visit.patient_id}, ${visit.caregiver_member_id},
        'voided', ${existingFin?.service_type ?? 'non_skilled'}, ${note},
        ${Number(existingFin?.pay_rate ?? 0)}, ${Number(existingFin?.pay_amount ?? 0)},
        ${Number(existingFin?.bill_rate ?? 0)}, ${Number(existingFin?.bill_amount ?? 0)},
        ${Number(existingFin?.approved_actual_hours ?? 0)}, ${Number(existingFin?.approved_billable_hours ?? 0)},
        ${null}, ${voidedCalculationBasisJson}::jsonb, ${nowIso}
      )
      ON CONFLICT (scheduled_visit_id) DO UPDATE SET
        visit_time_entry_id = EXCLUDED.visit_time_entry_id,
        patient_id = EXCLUDED.patient_id,
        caregiver_member_id = EXCLUDED.caregiver_member_id,
        status = EXCLUDED.status,
        service_type = EXCLUDED.service_type,
        coordinator_note = EXCLUDED.coordinator_note,
        pay_rate = EXCLUDED.pay_rate,
        pay_amount = EXCLUDED.pay_amount,
        bill_rate = EXCLUDED.bill_rate,
        bill_amount = EXCLUDED.bill_amount,
        approved_actual_hours = EXCLUDED.approved_actual_hours,
        approved_billable_hours = EXCLUDED.approved_billable_hours,
        visit_approval_id = EXCLUDED.visit_approval_id,
        calculation_basis = EXCLUDED.calculation_basis,
        updated_at = EXCLUDED.updated_at
    `

    const [appr] = await sql<{ id: string }[]>`
      SELECT id FROM visit_approvals WHERE visit_time_entry_id = ${vteId} LIMIT 1
    `
    if (appr?.id) {
      await sql`
        UPDATE visit_approvals SET ${sql({
          approval_status: 'rejected',
          approval_comment: note?.trim() ? `Voided: ${note.trim()}` : 'Voided for billing.',
          approved_at: new Date().toISOString(),
          approved_by_user_id: voidedByUserId,
          updated_at: new Date().toISOString(),
        })} WHERE id = ${appr.id}
      `
    }

    await sql`
      UPDATE visit_time_entries SET ${sql({
        entry_status: 'pending_review',
        updated_at: new Date().toISOString(),
      })} WHERE id = ${vteId}
    `

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to void visit billing.' }
  }
}
