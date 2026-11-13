import 'server-only'

import { z } from 'zod'
import sql from '@/db'
import { withCareOperationsManager } from '@/lib/repositories/visit-financial-reads'
import {
  managerVisitEditSchema,
  type ManagerVisitEditInput,
  type ManagerVisitEditSnapshot,
} from '@/lib/schemas/manager-visit-edit'

type VisitRow = {
  id: string
  agency_id: string
  patient_id: string
  caregiver_member_id: string | null
  contract_id: string | null
  service_type: string
  visit_date: string
  scheduled_end_date: string | null
  scheduled_start_time: string
  scheduled_end_time: string
  visit_timezone: ManagerVisitEditSnapshot['visitTimezone']
  status: string
  updated_at: string
}

type TimeRow = {
  id: string
  caregiver_member_id: string
  clock_in_time: string | null
  clock_out_time: string | null
  adjusted_start_time: string | null
  adjusted_end_time: string | null
  actual_hours: number | null
  billable_hours: number | null
  entry_status: string
}

type FinancialRow = { id: string; status: string; visit_approval_id: string | null }
type ApprovalRow = { id: string; approval_status: string }
type UpdatedVisitRow = { status: string }

class ManagerVisitEditError extends Error {}

function publicError(error: unknown) {
  return error instanceof ManagerVisitEditError
    ? error.message
    : 'Unable to update the visit. No changes were saved.'
}

function normalizeStatus(status: string): ManagerVisitEditSnapshot['status'] {
  if (status === 'unassigned') return 'scheduled'
  if (['scheduled', 'in_progress', 'completed', 'missed', 'on_hold'].includes(status)) {
    return status as ManagerVisitEditSnapshot['status']
  }
  throw new ManagerVisitEditError('This visit status cannot be edited here.')
}

function timeSource(entry: TimeRow | undefined): ManagerVisitEditSnapshot['timeSource'] {
  if (!entry || (!entry.clock_in_time && !entry.adjusted_start_time)) return 'none'
  if (entry.adjusted_start_time || entry.adjusted_end_time) {
    return entry.clock_in_time || entry.clock_out_time ? 'manager_adjusted' : 'manager_entered'
  }
  return 'caregiver'
}

async function loadVisitForActor(agencyId: string, visitId: string, lock = false) {
  const rows = lock
    ? await sql<VisitRow[]>`SELECT id,agency_id,patient_id,caregiver_member_id,contract_id,service_type,
        visit_date,scheduled_end_date,scheduled_start_time,scheduled_end_time,visit_timezone,status,updated_at
        FROM public.scheduled_visits WHERE id=${visitId}::uuid AND agency_id=${agencyId}::uuid FOR UPDATE`
    : await sql<VisitRow[]>`SELECT id,agency_id,patient_id,caregiver_member_id,contract_id,service_type,
        visit_date,scheduled_end_date,scheduled_start_time,scheduled_end_time,visit_timezone,status,updated_at
        FROM public.scheduled_visits WHERE id=${visitId}::uuid AND agency_id=${agencyId}::uuid`
  const visit = rows[0]
  if (!visit) throw new ManagerVisitEditError('Visit not found in your agency.')
  if (['cancelled', 'voided'].includes(visit.status)) {
    throw new ManagerVisitEditError('Cancelled or voided visits cannot be edited here.')
  }
  return visit
}

async function loadTime(agencyId: string, visitId: string, lock = false) {
  const rows = lock
    ? await sql<TimeRow[]>`SELECT id,caregiver_member_id,clock_in_time,clock_out_time,adjusted_start_time,
        adjusted_end_time,actual_hours,billable_hours,entry_status FROM public.visit_time_entries
        WHERE scheduled_visit_id=${visitId}::uuid AND agency_id=${agencyId}::uuid FOR UPDATE`
    : await sql<TimeRow[]>`SELECT id,caregiver_member_id,clock_in_time,clock_out_time,adjusted_start_time,
        adjusted_end_time,actual_hours,billable_hours,entry_status FROM public.visit_time_entries
        WHERE scheduled_visit_id=${visitId}::uuid AND agency_id=${agencyId}::uuid`
  return rows[0]
}

export async function readManagerVisitEditSnapshot(scheduledVisitId: string): Promise<{
  data: ManagerVisitEditSnapshot | null
  error?: string
}> {
  if (!z.uuid().safeParse(scheduledVisitId).success) return { data: null, error: 'Invalid visit.' }
  try {
    const data = await withCareOperationsManager(async actor => {
      const visit = await loadVisitForActor(actor.agencyId, scheduledVisitId)
      const entry = await loadTime(actor.agencyId, scheduledVisitId)
      const [financial] = await sql<FinancialRow[]>`SELECT id,status,visit_approval_id
        FROM public.visit_financials WHERE agency_id=${actor.agencyId}::uuid
          AND scheduled_visit_id=${visit.id}::uuid`
      const caregivers = await sql<{id:string;name:string}[]>`SELECT id,
        COALESCE(NULLIF(btrim(concat_ws(' ',first_name,last_name)),''),'Caregiver') AS name
        FROM public.caregiver_members WHERE agency_id=${actor.agencyId}::uuid
          AND (status='active' OR id=${visit.caregiver_member_id}::uuid)
        ORDER BY first_name,last_name,id`
      await sql`INSERT INTO public.audit_log
        (agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES (${actor.agencyId}::uuid,'scheduled_visits',${visit.id}::uuid,'READ',${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_manager_visit_editor' })}::jsonb)`
      return {
        scheduledVisitId: visit.id,
        updatedAt: visit.updated_at,
        visitDate: visit.visit_date,
        scheduledEndDate: visit.scheduled_end_date ?? visit.visit_date,
        scheduledStartTime: String(visit.scheduled_start_time).slice(0, 5),
        scheduledEndTime: String(visit.scheduled_end_time).slice(0, 5),
        caregiverMemberId: visit.caregiver_member_id,
        status: normalizeStatus(visit.status),
        visitTimezone: visit.visit_timezone,
        actualStartAt: entry?.adjusted_start_time ?? entry?.clock_in_time ?? null,
        actualEndAt: entry?.adjusted_end_time ?? entry?.clock_out_time ?? null,
        billableHours: Number(entry?.billable_hours ?? entry?.actual_hours ?? 0),
        timeSource: timeSource(entry),
        financialStatus: financial?.status ?? null,
        caregivers,
      } satisfies ManagerVisitEditSnapshot
    })
    return { data }
  } catch (error) {
    return { data: null, error: publicError(error) }
  }
}

export async function updateManagerVisit(input: ManagerVisitEditInput): Promise<{ ok?: true; error?: string }> {
  const parsed = managerVisitEditSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the visit details.' }

  try {
    await withCareOperationsManager(async actor => {
      const data = parsed.data
      const visit = await loadVisitForActor(actor.agencyId, data.scheduledVisitId, true)
      if (new Date(visit.updated_at).getTime() !== new Date(data.expectedUpdatedAt).getTime()) {
        throw new ManagerVisitEditError('The visit changed. Refresh and review it before saving.')
      }
      const entry = await loadTime(actor.agencyId, visit.id, true)
      const [financial] = await sql<FinancialRow[]>`SELECT id,status,visit_approval_id
        FROM public.visit_financials WHERE agency_id=${actor.agencyId}::uuid
          AND scheduled_visit_id=${visit.id}::uuid FOR UPDATE`
      const [approval] = await sql<ApprovalRow[]>`SELECT id,approval_status FROM public.visit_approvals
        WHERE agency_id=${actor.agencyId}::uuid AND scheduled_visit_id=${visit.id}::uuid FOR UPDATE`
      if (entry?.entry_status === 'approved' || financial?.status === 'approved' || approval?.approval_status === 'approved') {
        throw new ManagerVisitEditError('Void the approved Time & Billing decision before editing this visit.')
      }

      const caregiverId = data.caregiverMemberId || null
      if (caregiverId) {
        const [caregiver] = await sql<{id:string}[]>`SELECT id FROM public.caregiver_members
          WHERE id=${caregiverId}::uuid AND agency_id=${actor.agencyId}::uuid AND status='active' FOR UPDATE`
        if (!caregiver) throw new ManagerVisitEditError('Select an active caregiver from this agency.')
        if (entry && entry.caregiver_member_id !== caregiverId) {
          throw new ManagerVisitEditError('This visit has time evidence for another caregiver. Keep that caregiver or resolve the time entry first.')
        }
        const conflicts = await sql<{id:string}[]>`SELECT id FROM public.scheduled_visits
          WHERE agency_id=${actor.agencyId}::uuid AND caregiver_member_id=${caregiverId}::uuid
            AND id<>${visit.id}::uuid AND status NOT IN ('cancelled','missed','voided')
            AND (visit_date::timestamp + scheduled_start_time)
              < (${data.scheduledEndDate}::date::timestamp + ${data.scheduledEndTime}::time)
            AND (COALESCE(scheduled_end_date,visit_date)::timestamp + scheduled_end_time)
              > (${data.visitDate}::date::timestamp + ${data.scheduledStartTime}::time)
          LIMIT 1`
        if (conflicts.length) throw new ManagerVisitEditError('This caregiver is already booked during the selected time.')
      }

      if (entry && !data.actualStartAt && (entry.clock_in_time || entry.adjusted_start_time)) {
        if (data.status !== 'missed') {
          throw new ManagerVisitEditError('Recorded visit time cannot be erased. Enter the existing or corrected time.')
        }
      }

      const [convertedTime] = data.actualStartAt && data.visitTimezone
        ? await sql<{actual_start: Date | string; actual_end: Date | string | null}[]>`SELECT
            (${data.actualStartAt}::timestamp AT TIME ZONE ${data.visitTimezone}) AS actual_start,
            (NULLIF(${data.actualEndAt},'')::timestamp AT TIME ZONE ${data.visitTimezone}) AS actual_end`
        : []
      const actualStart = convertedTime?.actual_start
        ? new Date(convertedTime.actual_start).toISOString()
        : null
      const actualEnd = convertedTime?.actual_end
        ? new Date(convertedTime.actual_end).toISOString()
        : null
      const actualHours = actualStart && actualEnd
        ? Math.round(((Date.parse(actualEnd) - Date.parse(actualStart)) / 3_600_000) * 100) / 100
        : null
      if (actualEnd && Date.parse(actualEnd) > Date.now()) {
        throw new ManagerVisitEditError('Actual end time cannot be in the future.')
      }
      if (actualHours !== null && (actualHours <= 0 || actualHours > 744)) {
        throw new ManagerVisitEditError('Actual visit time must be greater than zero and no more than 744 hours.')
      }

      const [updatedVisit] = await sql<UpdatedVisitRow[]>`UPDATE public.scheduled_visits SET
        visit_date=${data.visitDate}::date,scheduled_end_date=${data.scheduledEndDate}::date,
        scheduled_start_time=${data.scheduledStartTime}::time,scheduled_end_time=${data.scheduledEndTime}::time,
        visit_timezone=${data.visitTimezone || null},caregiver_member_id=${caregiverId}::uuid,
        status=${data.status},status_reason=${data.changeNote},updated_at=now()
        WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid
        RETURNING status`
      if (!updatedVisit) throw new Error('Visit was not updated')
      const correctedStatus = updatedVisit.status

      let entryId = entry?.id ?? null
      if (actualStart && caregiverId) {
        if (entry) {
          await sql`UPDATE public.visit_time_entries SET
            adjusted_start_time=${actualStart}::timestamptz,adjusted_end_time=${actualEnd}::timestamptz,
            actual_hours=${actualHours},billable_hours=${actualHours === null ? null : data.billableHours},
            entry_status='pending_review',adjustment_comment=${data.changeNote},updated_at=now()
            WHERE id=${entry.id}::uuid AND agency_id=${actor.agencyId}::uuid`
        } else {
          const [created] = await sql<{id:string}[]>`INSERT INTO public.visit_time_entries
            (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,adjusted_start_time,adjusted_end_time,
             actual_hours,billable_hours,entry_status,adjustment_comment)
            VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${visit.patient_id}::uuid,${caregiverId}::uuid,
              ${actualStart}::timestamptz,${actualEnd}::timestamptz,${actualHours},
              ${actualHours === null ? null : data.billableHours},'pending_review',${data.changeNote})
            RETURNING id`
          if (!created) throw new Error('Time entry was not created')
          entryId = created.id
        }
      } else if (entry && data.status === 'missed') {
        await sql`UPDATE public.visit_time_entries SET entry_status='rejected',adjustment_comment=${data.changeNote},updated_at=now()
          WHERE id=${entry.id}::uuid AND agency_id=${actor.agencyId}::uuid`
      }

      const changeType = actualStart ? 'manager_manual_time' : 'manager_visit_edit'
      const [correction] = await sql<{id:string}[]>`INSERT INTO public.visit_corrections
        (agency_id,scheduled_visit_id,corrected_by_user_id,change_type,care_verified,previous_status,corrected_status,
         reason,previous_caregiver_member_id,corrected_caregiver_member_id,
         actual_start_time,actual_end_time,actual_hours,billable_hours,previous_financial_status,
         previous_visit_date,corrected_visit_date,previous_scheduled_start_time,corrected_scheduled_start_time,
         previous_scheduled_end_date,corrected_scheduled_end_date,previous_scheduled_end_time,corrected_scheduled_end_time,
         previous_actual_start_time,previous_actual_end_time)
        VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${actor.id}::uuid,${changeType},${data.careVerified},${visit.status},${correctedStatus},
          ${data.changeNote},${visit.caregiver_member_id}::uuid,${caregiverId}::uuid,
          ${actualStart}::timestamptz,${actualEnd}::timestamptz,${actualHours},
          ${actualHours === null ? null : data.billableHours},${financial?.status ?? null},
          ${visit.visit_date}::date,${data.visitDate}::date,${visit.scheduled_start_time}::time,${data.scheduledStartTime}::time,
          ${visit.scheduled_end_date ?? visit.visit_date}::date,${data.scheduledEndDate}::date,
          ${visit.scheduled_end_time}::time,${data.scheduledEndTime}::time,
          ${entry?.adjusted_start_time ?? entry?.clock_in_time ?? null}::timestamptz,
          ${entry?.adjusted_end_time ?? entry?.clock_out_time ?? null}::timestamptz)
        RETURNING id`
      if (!correction) throw new Error('Visit history was not created')

      if (entryId && actualStart) {
        await sql`INSERT INTO public.visit_adjustment_history
          (agency_id,visit_time_entry_id,changed_by_user_id,reason,previous_actual_hours,current_actual_hours,
           previous_billable_hours,current_billable_hours,note)
          VALUES (${actor.agencyId}::uuid,${entryId}::uuid,${actor.id}::uuid,${changeType},
            ${entry?.actual_hours ?? null},${actualHours},${entry?.billable_hours ?? null},
            ${actualHours === null ? null : data.billableHours},${data.changeNote})`
      }

      if (entryId && actualHours !== null && caregiverId) {
        await sql`INSERT INTO public.visit_financials
          (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,contract_id,
           service_type,status,approved_actual_hours,approved_billable_hours,calculation_basis,
           pay_rate,pay_unit_type,pay_amount,bill_rate,bill_unit_type,bill_amount)
          VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${entryId}::uuid,${visit.patient_id}::uuid,
            ${caregiverId}::uuid,${visit.contract_id}::uuid,${visit.service_type},'pending',${actualHours},${data.billableHours},
            ${JSON.stringify({ source: 'manager_visit_edit', correction_id: correction.id })}::jsonb,
            0,'hour',0,0,'hour',0)
          ON CONFLICT (scheduled_visit_id) DO UPDATE SET
            visit_time_entry_id=EXCLUDED.visit_time_entry_id,caregiver_member_id=EXCLUDED.caregiver_member_id,
            status='pending',approved_actual_hours=EXCLUDED.approved_actual_hours,
            approved_billable_hours=EXCLUDED.approved_billable_hours,
            calculation_basis=EXCLUDED.calculation_basis,updated_at=now()`
      } else if (financial && data.status === 'missed') {
        await sql`UPDATE public.visit_financials SET status='voided',coordinator_note=${data.changeNote},updated_at=now()
          WHERE id=${financial.id}::uuid AND agency_id=${actor.agencyId}::uuid`
      }

      const [note] = await sql<{id:string}[]>`INSERT INTO public.internal_notes
        (agency_id,subject_type,subject_id,content,created_by)
        VALUES (${actor.agencyId}::uuid,'visit',${visit.id}::uuid,${data.changeNote},${actor.id}::uuid)
        RETURNING id`
      if (!note) throw new Error('Visit note was not created')
      await sql`INSERT INTO public.audit_log
        (agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES
          (${actor.agencyId}::uuid,'scheduled_visits',${visit.id}::uuid,'UPDATE',${actor.id}::uuid,
            ${JSON.stringify({ operation: 'manager_single_visit_edit', correction_id: correction.id, change_type: changeType })}::jsonb),
          (${actor.agencyId}::uuid,'internal_notes',${note.id}::uuid,'INSERT',${actor.id}::uuid,
            ${JSON.stringify({ operation: 'manager_single_visit_edit_note', subject_type: 'visit', subject_id: visit.id, content_length: data.changeNote.length })}::jsonb)`
    })
    return { ok: true }
  } catch (error) {
    return { error: publicError(error) }
  }
}
