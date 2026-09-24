import 'server-only'

import sql from '@/db'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'
import {
  billRateBatchSchema,
  visitMileageSchema,
  type BillRateBatchInput,
  type VisitMileageInput,
} from '@/lib/schemas/financial-maintenance'

export type FinancialMaintenanceResult = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

class MaintenanceError extends Error {}

const fieldErrors = (issues: { path: PropertyKey[]; message: string }[]) => {
  const result: Record<string, string[]> = {}
  for (const issue of issues) {
    const path = issue.path.join('.') || 'root'
    ;(result[path] ??= []).push(issue.message)
  }
  return result
}

export async function savePatientServiceContractBillRates(
  input: BillRateBatchInput
): Promise<FinancialMaintenanceResult> {
  const parsed = billRateBatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Check the bill-rate fields.', fieldErrors: fieldErrors(parsed.error.issues) }

  try {
    await withAgencyManagerFinancialRead(async actor => {
      const changes = [...parsed.data.rates].sort((a, b) => a.contractId.localeCompare(b.contractId))
      const ids = changes.map(change => change.contractId)
      const contracts = await sql<{ id: string; bill_rate: number | null }[]>`
        SELECT id,bill_rate FROM public.patient_service_contracts
        WHERE agency_id=${actor.agencyId}::uuid AND id=ANY(${ids}::uuid[])
        ORDER BY id FOR UPDATE`
      if (contracts.length !== changes.length) throw new MaintenanceError('One or more contracts were not found in your agency.')

      const current = new Map(contracts.map(contract => [contract.id, Number(contract.bill_rate ?? 0)]))
      for (const change of changes) {
        if (current.get(change.contractId) === change.billRate) continue
        await sql`UPDATE public.patient_service_contracts
          SET bill_rate=${change.billRate},updated_at=now()
          WHERE id=${change.contractId}::uuid AND agency_id=${actor.agencyId}::uuid`
        await sql`INSERT INTO public.audit_log
          (agency_id,table_name,record_id,action,performed_by_user_id,details)
          VALUES(${actor.agencyId}::uuid,'patient_service_contracts',${change.contractId}::uuid,
            'UPDATE',${actor.id}::uuid,
            ${JSON.stringify({ operation: 'update_current_bill_rate', field: 'bill_rate',
              changed: true, frozen_visit_financials_preserved: true })}::jsonb)`
      }
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof MaintenanceError
      ? error.message : 'Unable to save bill rates. No changes were saved.' }
  }
}

export async function saveVisitMileage(input: VisitMileageInput): Promise<FinancialMaintenanceResult> {
  const parsed = visitMileageSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Check the mileage field.', fieldErrors: fieldErrors(parsed.error.issues) }

  try {
    await withAgencyManagerFinancialRead(async actor => {
      const [visit] = await sql<{ id: string; mileage_miles: number | null }[]>`
        SELECT id,mileage_miles FROM public.scheduled_visits
        WHERE id=${parsed.data.scheduledVisitId}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
      if (!visit) throw new MaintenanceError('Visit not found in your agency.')
      const previous = visit.mileage_miles == null ? null : Number(visit.mileage_miles)
      if (previous === parsed.data.mileageMiles) return
      await sql`UPDATE public.scheduled_visits SET mileage_miles=${parsed.data.mileageMiles},updated_at=now()
        WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid`
      await sql`INSERT INTO public.audit_log
        (agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES(${actor.agencyId}::uuid,'scheduled_visits',${visit.id}::uuid,'UPDATE',${actor.id}::uuid,
          ${JSON.stringify({ operation: 'update_visit_mileage', field: 'mileage_miles',
            changed: true, value_present: parsed.data.mileageMiles !== null })}::jsonb)`
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof MaintenanceError
      ? error.message : 'Unable to save mileage. No changes were saved.' }
  }
}
