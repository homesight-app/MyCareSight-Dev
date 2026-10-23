import 'server-only'

import { z } from 'zod'
import sql from '@/db'
import { withCareOperationsManager } from '@/lib/repositories/visit-financial-reads'
import { visitCorrectionSchema, type VisitCorrectionInput } from '@/lib/schemas/visit-correction'

type Visit = {
  id: string
  agency_id: string
  patient_id: string
  caregiver_member_id: string | null
  service_type: string
  status: string
}

type TimeEntry = {
  id: string
  caregiver_member_id: string
  actual_hours: number | null
  billable_hours: number | null
}

type Financial = { id: string; status: string; visit_approval_id: string | null }
type Approval = { id: string; approval_status: string }

export type VisitCorrectionHistoryItem = {
  id: string
  previousStatus: string
  correctedStatus: string
  reason: string
  actualStartTime: string | null
  actualEndTime: string | null
  actualHours: number | null
  billableHours: number | null
  correctedByUserId: string
  createdAt: string
}

class CorrectionError extends Error {}

function publicError(error: unknown): string {
  return error instanceof CorrectionError ? error.message : 'Unable to correct the visit. No changes were saved.'
}

export async function correctVisit(input: VisitCorrectionInput): Promise<{ ok?: true; error?: string }> {
  const parsed = visitCorrectionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid visit correction.' }

  try {
    await withCareOperationsManager(async actor => {
      if (actor.role !== 'company_owner') throw new CorrectionError('Only an agency administrator can correct a visit.')
      const data = parsed.data
      const [visit] = await sql<Visit[]>`
        SELECT id,agency_id,patient_id,caregiver_member_id,service_type,status
        FROM public.scheduled_visits
        WHERE id=${data.scheduledVisitId}::uuid AND agency_id=${actor.agencyId}::uuid
        FOR UPDATE`
      if (!visit) throw new CorrectionError('Visit not found in your agency.')
      if (visit.status !== data.expectedStatus) {
        throw new CorrectionError('The visit changed. Refresh and review it before correcting.')
      }

      const [entry] = await sql<TimeEntry[]>`
        SELECT id,caregiver_member_id,actual_hours,billable_hours
        FROM public.visit_time_entries
        WHERE scheduled_visit_id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
      const [financial] = await sql<Financial[]>`
        SELECT id,status,visit_approval_id FROM public.visit_financials
        WHERE scheduled_visit_id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
      const [approval] = await sql<Approval[]>`
        SELECT id,approval_status FROM public.visit_approvals
        WHERE scheduled_visit_id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
      if (financial?.status === 'approved' || approval?.approval_status === 'approved') {
        throw new CorrectionError('Void the approved Time & Billing decision before correcting this visit.')
      }

      if (data.correctedStatus === 'completed') {
        const [caregiver] = await sql<{id:string}[]>`
          SELECT id FROM public.caregiver_members
          WHERE id=${data.caregiverMemberId}::uuid AND agency_id=${actor.agencyId}::uuid
            AND status='active' FOR UPDATE`
        if (!caregiver) throw new CorrectionError('Select an active caregiver from this agency.')
        if (entry && entry.caregiver_member_id !== caregiver.id) {
          throw new CorrectionError('This visit already has caregiver time evidence. Keep its recorded caregiver.')
        }
        const startMs = Date.parse(data.actualStartAt)
        const endMs = Date.parse(data.actualEndAt)
        const actualHours = Math.round(((endMs - startMs) / 3_600_000) * 100) / 100
        if (endMs > Date.now() || actualHours <= 0 || actualHours > 744) {
          throw new CorrectionError('Enter actual times that have already occurred, up to 744 hours apart.')
        }

        await sql`UPDATE public.scheduled_visits SET status='completed',status_reason=${data.reason},
          caregiver_member_id=${caregiver.id}::uuid,updated_at=now()
          WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid`

        let entryId = entry?.id
        if (entry) {
          await sql`UPDATE public.visit_time_entries SET adjusted_start_time=${data.actualStartAt}::timestamptz,
            adjusted_end_time=${data.actualEndAt}::timestamptz,actual_hours=${actualHours},
            billable_hours=${data.billableHours},entry_status='pending_review',
            adjustment_comment=${data.reason},updated_at=now()
            WHERE id=${entry.id}::uuid AND agency_id=${actor.agencyId}::uuid`
        } else {
          const [created] = await sql<{id:string}[]>`
            INSERT INTO public.visit_time_entries
              (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,
               adjusted_start_time,adjusted_end_time,actual_hours,billable_hours,
               entry_status,adjustment_comment)
            VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${visit.patient_id}::uuid,
              ${caregiver.id}::uuid,${data.actualStartAt}::timestamptz,
              ${data.actualEndAt}::timestamptz,${actualHours},${data.billableHours},
              'pending_review',${data.reason}) RETURNING id`
          if (!created) throw new Error('Time entry was not created')
          entryId = created.id
        }

        const [correction] = await sql<{id:string}[]>`
          INSERT INTO public.visit_corrections
            (agency_id,scheduled_visit_id,corrected_by_user_id,previous_status,corrected_status,
             reason,previous_caregiver_member_id,corrected_caregiver_member_id,
             actual_start_time,actual_end_time,actual_hours,billable_hours,previous_financial_status)
          VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${actor.id}::uuid,'missed','completed',
            ${data.reason},${visit.caregiver_member_id}::uuid,${caregiver.id}::uuid,
            ${data.actualStartAt}::timestamptz,${data.actualEndAt}::timestamptz,
            ${actualHours},${data.billableHours},${financial?.status ?? null}) RETURNING id`
        if (!correction) throw new Error('Correction history was not created')

        await sql`INSERT INTO public.visit_adjustment_history
          (agency_id,visit_time_entry_id,changed_by_user_id,reason,
           previous_actual_hours,current_actual_hours,previous_billable_hours,current_billable_hours,note)
          VALUES (${actor.agencyId}::uuid,${entryId}::uuid,${actor.id}::uuid,
            'administrator_manual_visit_completion',${entry?.actual_hours ?? null},${actualHours},
            ${entry?.billable_hours ?? null},${data.billableHours},${data.reason})`

        await sql`INSERT INTO public.visit_financials
          (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,
           service_type,status,approved_actual_hours,approved_billable_hours,calculation_basis,
           pay_rate,pay_unit_type,pay_amount,bill_rate,bill_unit_type,bill_amount)
          VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${entryId}::uuid,
            ${visit.patient_id}::uuid,${caregiver.id}::uuid,${visit.service_type},'pending',
            ${actualHours},${data.billableHours},
            ${JSON.stringify({ source: 'administrator_manual_correction', correction_id: correction.id })}::jsonb,
            0,'hour',0,0,'hour',0)
          ON CONFLICT (scheduled_visit_id) DO UPDATE SET
            visit_time_entry_id=EXCLUDED.visit_time_entry_id,
            caregiver_member_id=EXCLUDED.caregiver_member_id,
            status='pending',approved_actual_hours=EXCLUDED.approved_actual_hours,
            approved_billable_hours=EXCLUDED.approved_billable_hours,
            calculation_basis=EXCLUDED.calculation_basis,updated_at=now()`
        await sql`INSERT INTO public.audit_log
          (agency_id,table_name,record_id,action,performed_by_user_id,details)
          VALUES (${actor.agencyId}::uuid,'scheduled_visits',${visit.id}::uuid,'UPDATE',${actor.id}::uuid,
            ${JSON.stringify({ operation: 'administrator_visit_correction', correction_id: correction.id })}::jsonb)`
      } else {
        await sql`UPDATE public.scheduled_visits SET status='missed',status_reason=${data.reason},
          updated_at=now() WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid`
        if (financial && financial.status !== 'voided') {
          await sql`UPDATE public.visit_financials SET status='voided',updated_at=now()
            WHERE id=${financial.id}::uuid AND agency_id=${actor.agencyId}::uuid`
        }
        if (entry) {
          await sql`UPDATE public.visit_time_entries SET entry_status='rejected',updated_at=now()
            WHERE id=${entry.id}::uuid AND agency_id=${actor.agencyId}::uuid`
        }
        const [correction] = await sql<{id:string}[]>`
          INSERT INTO public.visit_corrections
            (agency_id,scheduled_visit_id,corrected_by_user_id,previous_status,corrected_status,
             reason,previous_caregiver_member_id,corrected_caregiver_member_id,previous_financial_status)
          VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${actor.id}::uuid,'completed','missed',
            ${data.reason},${visit.caregiver_member_id}::uuid,${visit.caregiver_member_id}::uuid,
            ${financial?.status ?? null}) RETURNING id`
        if (!correction) throw new Error('Correction history was not created')
        await sql`INSERT INTO public.audit_log
          (agency_id,table_name,record_id,action,performed_by_user_id,details)
          VALUES (${actor.agencyId}::uuid,'scheduled_visits',${visit.id}::uuid,'UPDATE',${actor.id}::uuid,
            ${JSON.stringify({ operation: 'administrator_visit_correction', correction_id: correction.id })}::jsonb)`
      }
    })
    return { ok: true }
  } catch (error) {
    return { error: publicError(error) }
  }
}

export async function readVisitCorrectionHistory(scheduledVisitId: string): Promise<{
  data: VisitCorrectionHistoryItem[] | null
  error?: string
}> {
  if (!z.uuid().safeParse(scheduledVisitId).success) {
    return { data: null, error: 'Invalid visit.' }
  }
  try {
    const data = await withCareOperationsManager(async actor => {
      if (actor.role !== 'company_owner') throw new CorrectionError('Only an agency administrator can view corrections.')
      const [visit] = await sql<{id:string}[]>`SELECT id FROM public.scheduled_visits
        WHERE id=${scheduledVisitId}::uuid AND agency_id=${actor.agencyId}::uuid`
      if (!visit) throw new CorrectionError('Visit not found in your agency.')
      const rows = await sql<{
        id:string;previous_status:string;corrected_status:string;reason:string;
        actual_start_time:string|null;actual_end_time:string|null;actual_hours:number|null;
        billable_hours:number|null;corrected_by_user_id:string;created_at:string
      }[]>`SELECT id,previous_status,corrected_status,reason,actual_start_time,actual_end_time,
        actual_hours,billable_hours,corrected_by_user_id,created_at
        FROM public.visit_corrections
        WHERE agency_id=${actor.agencyId}::uuid AND scheduled_visit_id=${visit.id}::uuid
        ORDER BY created_at DESC,id DESC`
      await sql`INSERT INTO public.audit_log
        (agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES (${actor.agencyId}::uuid,'visit_corrections',${visit.id}::uuid,'READ',${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_visit_correction_history', result_count: rows.length })}::jsonb)`
      return rows.map(row => ({
        id: row.id,
        previousStatus: row.previous_status,
        correctedStatus: row.corrected_status,
        reason: row.reason,
        actualStartTime: row.actual_start_time,
        actualEndTime: row.actual_end_time,
        actualHours: row.actual_hours === null ? null : Number(row.actual_hours),
        billableHours: row.billable_hours === null ? null : Number(row.billable_hours),
        correctedByUserId: row.corrected_by_user_id,
        createdAt: row.created_at,
      }))
    })
    return { data }
  } catch (error) {
    return { data: null, error: publicError(error) }
  }
}
