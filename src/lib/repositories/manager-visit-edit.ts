import 'server-only'

import { z } from 'zod'
import sql from '@/db'
import { withCareOperationsManager } from '@/lib/repositories/visit-financial-reads'
import {
  managerVisitEditSchema,
  type ManagerVisitEditInput,
  type ManagerVisitEditSnapshot,
} from '@/lib/schemas/manager-visit-edit'
import { resolveVisitTimezoneFromZip } from '@/lib/visit-location-timezone'

type VisitRow = {
  id: string
  agency_id: string
  patient_id: string
  patient_address_id: string | null
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
type VisitLocationRow = {
  id: string
  label: string
  street_address: string
  city: string
  state: string
  zip_code: string
  is_primary: boolean
}

class ManagerVisitEditError extends Error {}

function publicError(error: unknown) {
  return error instanceof ManagerVisitEditError
    ? error.message
    : 'Unable to update the visit. No changes were saved.'
}

function logSafeDatabaseFailure(error: unknown) {
  if (error instanceof ManagerVisitEditError) return
  const databaseError = error as {
    code?: unknown
    constraint_name?: unknown
    table_name?: unknown
    routine?: unknown
  }
  // Keep operational diagnostics useful without logging query text, values,
  // record identifiers, visit details, or any other PHI.
  console.error('[manager-visit-edit] transaction failed', {
    code: typeof databaseError?.code === 'string' ? databaseError.code : 'unknown',
    constraint: typeof databaseError?.constraint_name === 'string' ? databaseError.constraint_name : undefined,
    table: typeof databaseError?.table_name === 'string' ? databaseError.table_name : undefined,
    routine: typeof databaseError?.routine === 'string' ? databaseError.routine : undefined,
  })
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

function hasRecordedTime(entry: TimeRow | undefined) {
  return !!(entry && (entry.clock_in_time || entry.clock_out_time || entry.adjusted_start_time || entry.adjusted_end_time))
}

async function loadVisitForActor(agencyId: string, visitId: string, lock = false) {
  const rows = lock
    ? await sql<VisitRow[]>`SELECT id,agency_id,patient_id,caregiver_member_id,contract_id,service_type,
        visit_date,scheduled_end_date,scheduled_start_time,scheduled_end_time,visit_timezone,status,updated_at,patient_address_id
        FROM public.scheduled_visits WHERE id=${visitId}::uuid AND agency_id=${agencyId}::uuid FOR UPDATE`
    : await sql<VisitRow[]>`SELECT id,agency_id,patient_id,caregiver_member_id,contract_id,service_type,
        visit_date,scheduled_end_date,scheduled_start_time,scheduled_end_time,visit_timezone,status,updated_at,patient_address_id
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
      const visitLocations = await sql<VisitLocationRow[]>`SELECT id,label,street_address,city,state,zip_code,is_primary
        FROM public.patient_addresses WHERE agency_id=${actor.agencyId}::uuid
          AND patient_id=${visit.patient_id}::uuid ORDER BY is_primary DESC,created_at ASC`
      const [caregiver] = visit.caregiver_member_id
        ? await sql<{first_name:string | null; last_name:string | null}[]>`SELECT first_name,last_name
            FROM public.caregiver_members WHERE id=${visit.caregiver_member_id}::uuid
              AND agency_id=${actor.agencyId}::uuid`
        : []
      const [financial] = await sql<FinancialRow[]>`SELECT id,status,visit_approval_id
        FROM public.visit_financials WHERE agency_id=${actor.agencyId}::uuid
          AND scheduled_visit_id=${visit.id}::uuid`
      await sql`INSERT INTO public.audit_log
        (agency_id,table_name,record_id,action,performed_by_user_id,details)
        VALUES (${actor.agencyId}::uuid,'scheduled_visits',${visit.id}::uuid,'READ',${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_manager_visit_editor' })}::jsonb)`
      return {
        scheduledVisitId: visit.id,
        updatedAt: visit.updated_at,
        patientAddressId: visit.patient_address_id,
        visitLocations: visitLocations.map(address => ({
          id: address.id,
          label: `${address.label}${address.is_primary ? ' (Primary)' : ''}`,
          displayAddress: `${address.street_address}, ${address.city}, ${address.state} ${address.zip_code}`,
        })),
        visitDate: visit.visit_date,
        scheduledEndDate: visit.scheduled_end_date ?? visit.visit_date,
        scheduledStartTime: String(visit.scheduled_start_time).slice(0, 5),
        scheduledEndTime: String(visit.scheduled_end_time).slice(0, 5),
        caregiverMemberId: visit.caregiver_member_id,
        caregiverName: caregiver ? [caregiver.first_name, caregiver.last_name].filter(Boolean).join(' ') || 'Assigned caregiver' : null,
        status: normalizeStatus(visit.status),
        visitTimezone: visit.visit_timezone,
        actualStartAt: entry?.adjusted_start_time ?? entry?.clock_in_time ?? null,
        actualEndAt: entry?.adjusted_end_time ?? entry?.clock_out_time ?? null,
        actualHours: entry?.actual_hours === null || entry?.actual_hours === undefined ? null : Number(entry.actual_hours),
        timeSource: timeSource(entry),
        financialStatus: financial?.status ?? null,
      } satisfies ManagerVisitEditSnapshot
    })
    return { data }
  } catch (error) {
    return { data: null, error: publicError(error) }
  }
}

/** Persist the location-derived zone once for visits created before visit_timezone existed. */
export async function prepareManagerVisitTimeSnapshot(scheduledVisitId: string): Promise<{
  data: ManagerVisitEditSnapshot | null
  error?: string
}> {
  if (!z.uuid().safeParse(scheduledVisitId).success) return { data: null, error: 'Invalid visit.' }
  try {
    await withCareOperationsManager(async actor => {
      const visit = await loadVisitForActor(actor.agencyId, scheduledVisitId, true)
      if (visit.visit_timezone || !visit.patient_address_id) return
      const [address] = await sql<{zip_code:string}[]>`SELECT zip_code FROM public.patient_addresses
        WHERE id=${visit.patient_address_id}::uuid AND agency_id=${actor.agencyId}::uuid
          AND patient_id=${visit.patient_id}::uuid`
      if (!address) return
      const timezone = resolveVisitTimezoneFromZip(address.zip_code)
      if (!timezone) return
      const [updated] = await sql<{id:string}[]>`UPDATE public.scheduled_visits SET
        visit_timezone=${timezone},updated_at=now()
        WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid
          AND patient_address_id=${visit.patient_address_id}::uuid AND visit_timezone IS NULL
        RETURNING id`
      if (updated) {
        await sql`INSERT INTO public.audit_log
          (agency_id,table_name,record_id,action,performed_by_user_id,details)
          VALUES (${actor.agencyId}::uuid,'scheduled_visits',${visit.id}::uuid,'UPDATE',${actor.id}::uuid,
            ${JSON.stringify({ operation: 'initialize_legacy_visit_timezone', source: 'saved_visit_address' })}::jsonb)`
      }
    })
    return readManagerVisitEditSnapshot(scheduledVisitId)
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

      const visitDate = data.scope === 'schedule' ? data.visitDate : visit.visit_date
      const scheduledEndDate = data.scope === 'schedule' ? data.scheduledEndDate : (visit.scheduled_end_date ?? visit.visit_date)
      const scheduledStartTime = data.scope === 'schedule' ? data.scheduledStartTime : String(visit.scheduled_start_time).slice(0, 5)
      const scheduledEndTime = data.scope === 'schedule' ? data.scheduledEndTime : String(visit.scheduled_end_time).slice(0, 5)
      const caregiverId = data.scope === 'caregiver'
        ? data.caregiverMemberId || null
        : visit.caregiver_member_id
      let patientAddressId = visit.patient_address_id
      let scheduleTimezone = visit.visit_timezone

      if (data.scope === 'location') {
        const [address] = await sql<{id:string;zip_code:string}[]>`SELECT id,zip_code FROM public.patient_addresses
          WHERE id=${data.patientAddressId}::uuid AND agency_id=${actor.agencyId}::uuid
            AND patient_id=${visit.patient_id}::uuid FOR UPDATE`
        if (!address) throw new ManagerVisitEditError('Select a saved address for this client.')
        patientAddressId = address.id
        if (address.id !== visit.patient_address_id || !scheduleTimezone) {
          scheduleTimezone = resolveVisitTimezoneFromZip(address.zip_code)
          if (!scheduleTimezone) {
            throw new ManagerVisitEditError('The selected visit location does not have a supported time zone.')
          }
        }
      }

      if (data.scope === 'time' && !caregiverId) {
        throw new ManagerVisitEditError('Assign a caregiver before recording visit time.')
      }
      if ((data.scope === 'caregiver' || data.scope === 'time') && entry && entry.caregiver_member_id !== caregiverId) {
        throw new ManagerVisitEditError('This visit has time evidence for another caregiver. Keep that caregiver or resolve the time entry first.')
      }
      if (data.scope === 'caregiver' && !caregiverId && hasRecordedTime(entry)) {
        throw new ManagerVisitEditError('A caregiver with recorded time cannot be unassigned here.')
      }

      if (caregiverId && ['schedule', 'caregiver'].includes(data.scope)) {
        const [caregiver] = await sql<{id:string}[]>`SELECT id FROM public.caregiver_members
          WHERE id=${caregiverId}::uuid AND agency_id=${actor.agencyId}::uuid AND status='active' FOR UPDATE`
        if (!caregiver) throw new ManagerVisitEditError('Select an active caregiver from this agency.')
        const conflicts = await sql<{id:string}[]>`SELECT id FROM public.scheduled_visits
          WHERE agency_id=${actor.agencyId}::uuid AND caregiver_member_id=${caregiverId}::uuid
            AND id<>${visit.id}::uuid AND status NOT IN ('cancelled','missed','voided')
            AND (visit_date::timestamp + scheduled_start_time)
              < (${scheduledEndDate}::date::timestamp + ${scheduledEndTime}::time)
            AND (COALESCE(scheduled_end_date,visit_date)::timestamp + scheduled_end_time)
              > (${visitDate}::date::timestamp + ${scheduledStartTime}::time)
          LIMIT 1`
        if (conflicts.length) throw new ManagerVisitEditError('This caregiver is already booked during the selected time.')
      }

      if (data.scope === 'status' && hasRecordedTime(entry)) {
        throw new ManagerVisitEditError('This visit has recorded time. Use Edit Recorded Time; its clock record determines the visit status.')
      }

      let actualStart: string | null = null
      let actualEnd: string | null = null
      let actualHours: number | null = null
      let visitTimezone: ManagerVisitEditSnapshot['visitTimezone'] = null
      if (data.scope === 'time') {
        visitTimezone = visit.visit_timezone
        if (!visitTimezone) {
          throw new ManagerVisitEditError('The visit does not have a stored time zone. Edit the visit location before recording time.')
        }
        // Bind wall-clock input as text first. A directly inferred timestamp parameter
        // is shifted by postgres.js before PostgreSQL applies the visit time zone.
        const [convertedTime] = await sql<{actual_start: Date | string; actual_end: Date | string | null}[]>`SELECT
          (${data.actualStartAt}::text::timestamp AT TIME ZONE ${visitTimezone}) AS actual_start,
          (NULLIF(${data.actualEndAt}::text,'')::timestamp AT TIME ZONE ${visitTimezone}) AS actual_end`
        actualStart = new Date(convertedTime.actual_start).toISOString()
        actualEnd = convertedTime.actual_end ? new Date(convertedTime.actual_end).toISOString() : null
        actualHours = actualEnd
          ? Math.round(((Date.parse(actualEnd) - Date.parse(actualStart)) / 3_600_000) * 100) / 100
          : null
        if (actualEnd && Date.parse(actualEnd) > Date.now()) throw new ManagerVisitEditError('Actual end time cannot be in the future.')
        if (actualHours !== null && (actualHours <= 0 || actualHours > 744)) {
          throw new ManagerVisitEditError('Actual visit time must be greater than zero and no more than 744 hours.')
        }
      }

      let updatedRows: UpdatedVisitRow[]
      if (data.scope === 'schedule') {
        updatedRows = await sql<UpdatedVisitRow[]>`UPDATE public.scheduled_visits SET
          visit_date=${data.visitDate}::date,scheduled_end_date=${data.scheduledEndDate}::date,
          scheduled_start_time=${data.scheduledStartTime}::time,scheduled_end_time=${data.scheduledEndTime}::time,
          status_reason=${data.changeNote},updated_at=now()
          WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid RETURNING status`
      } else if (data.scope === 'location') {
        updatedRows = await sql<UpdatedVisitRow[]>`UPDATE public.scheduled_visits SET
          patient_address_id=${patientAddressId}::uuid,visit_timezone=${scheduleTimezone},
          status_reason=${data.changeNote},updated_at=now()
          WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid RETURNING status`
      } else if (data.scope === 'caregiver') {
        updatedRows = await sql<UpdatedVisitRow[]>`UPDATE public.scheduled_visits SET
          caregiver_member_id=${caregiverId}::uuid,status_reason=${data.changeNote},updated_at=now()
          WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid RETURNING status`
      } else if (data.scope === 'status') {
        updatedRows = await sql<UpdatedVisitRow[]>`UPDATE public.scheduled_visits SET
          status=${data.status},status_reason=${data.changeNote},updated_at=now()
          WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid RETURNING status`
      } else {
        const derivedStatus = actualEnd ? 'completed' : 'in_progress'
        updatedRows = await sql<UpdatedVisitRow[]>`UPDATE public.scheduled_visits SET
          visit_timezone=${visitTimezone},status=${derivedStatus},
          status_reason=${data.changeNote},updated_at=now()
          WHERE id=${visit.id}::uuid AND agency_id=${actor.agencyId}::uuid RETURNING status`
      }
      const updatedVisit = updatedRows[0]
      if (!updatedVisit) throw new Error('Visit was not updated')
      const correctedStatus = updatedVisit.status

      let entryId = entry?.id ?? null
      if (data.scope === 'time' && caregiverId && actualStart) {
        if (entry) {
          await sql`UPDATE public.visit_time_entries SET
            adjusted_start_time=${actualStart}::timestamptz,adjusted_end_time=${actualEnd}::timestamptz,
            actual_hours=${actualHours},billable_hours=${actualHours},
            entry_status='pending_review',adjustment_comment=${data.changeNote},updated_at=now()
            WHERE id=${entry.id}::uuid AND agency_id=${actor.agencyId}::uuid`
        } else {
          const [created] = await sql<{id:string}[]>`INSERT INTO public.visit_time_entries
            (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,adjusted_start_time,adjusted_end_time,
             actual_hours,billable_hours,entry_status,adjustment_comment)
            VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${visit.patient_id}::uuid,${caregiverId}::uuid,
              ${actualStart}::timestamptz,${actualEnd}::timestamptz,${actualHours},
              ${actualHours},'pending_review',${data.changeNote})
            RETURNING id`
          if (!created) throw new Error('Time entry was not created')
          entryId = created.id
        }
      }

      const changeType = data.scope === 'time' ? 'manager_manual_time' : 'manager_visit_edit'
      const [correction] = await sql<{id:string}[]>`INSERT INTO public.visit_corrections
        (agency_id,scheduled_visit_id,corrected_by_user_id,change_type,care_verified,previous_status,corrected_status,
         reason,previous_caregiver_member_id,corrected_caregiver_member_id,
         actual_start_time,actual_end_time,actual_hours,billable_hours,previous_financial_status,
         previous_visit_date,corrected_visit_date,previous_scheduled_start_time,corrected_scheduled_start_time,
         previous_scheduled_end_date,corrected_scheduled_end_date,previous_scheduled_end_time,corrected_scheduled_end_time,
         previous_actual_start_time,previous_actual_end_time)
        VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${actor.id}::uuid,${changeType},
          ${data.scope === 'time'},${visit.status},${correctedStatus},${data.changeNote},
          ${visit.caregiver_member_id}::uuid,${caregiverId}::uuid,
          ${actualStart}::timestamptz,${actualEnd}::timestamptz,${actualHours},
          ${data.scope === 'time' ? actualHours : null},${financial?.status ?? null},
          ${visit.visit_date}::date,${visitDate}::date,${visit.scheduled_start_time}::time,${scheduledStartTime}::time,
          ${visit.scheduled_end_date ?? visit.visit_date}::date,${scheduledEndDate}::date,
          ${visit.scheduled_end_time}::time,${scheduledEndTime}::time,
          ${entry?.adjusted_start_time ?? entry?.clock_in_time ?? null}::timestamptz,
          ${entry?.adjusted_end_time ?? entry?.clock_out_time ?? null}::timestamptz)
        RETURNING id`
      if (!correction) throw new Error('Visit history was not created')

      if (data.scope === 'time' && entryId && actualStart) {
        await sql`INSERT INTO public.visit_adjustment_history
          (agency_id,visit_time_entry_id,changed_by_user_id,reason,previous_actual_hours,current_actual_hours,
           previous_billable_hours,current_billable_hours,note)
          VALUES (${actor.agencyId}::uuid,${entryId}::uuid,${actor.id}::uuid,${changeType},
            ${entry?.actual_hours ?? null},${actualHours},${entry?.billable_hours ?? null},
            ${actualHours},${data.changeNote})`
      }

      if (data.scope === 'time' && entryId && actualHours !== null && caregiverId) {
        await sql`INSERT INTO public.visit_financials
          (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,contract_id,
           service_type,status,approved_actual_hours,approved_billable_hours,calculation_basis,
           pay_rate,pay_unit_type,pay_amount,bill_rate,bill_unit_type,bill_amount)
          VALUES (${actor.agencyId}::uuid,${visit.id}::uuid,${entryId}::uuid,${visit.patient_id}::uuid,
            ${caregiverId}::uuid,${visit.contract_id}::uuid,${visit.service_type},'pending',${actualHours},${actualHours},
            ${JSON.stringify({ source: 'manager_visit_edit', scope: 'time', correction_id: correction.id })}::jsonb,
            0,'hour',0,0,'hour',0)
          ON CONFLICT (scheduled_visit_id) DO UPDATE SET
            status='pending',approved_actual_hours=EXCLUDED.approved_actual_hours,
            approved_billable_hours=EXCLUDED.approved_billable_hours,
            calculation_basis=EXCLUDED.calculation_basis,updated_at=now()`
      } else if (data.scope === 'status' && data.status === 'missed' && financial) {
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
            ${JSON.stringify({ operation: 'manager_single_visit_edit', scope: data.scope, correction_id: correction.id, change_type: changeType,
              location_changed: data.scope === 'location' && patientAddressId !== visit.patient_address_id,
              previous_location_id: data.scope === 'location' ? visit.patient_address_id : null,
              corrected_location_id: data.scope === 'location' ? patientAddressId : null })}::jsonb),
          (${actor.agencyId}::uuid,'internal_notes',${note.id}::uuid,'INSERT',${actor.id}::uuid,
            ${JSON.stringify({ operation: 'manager_single_visit_edit_note', scope: data.scope, subject_type: 'visit', subject_id: visit.id, content_length: data.changeNote.length })}::jsonb)`
    })
    return { ok: true }
  } catch (error) {
    logSafeDatabaseFailure(error)
    return { error: publicError(error) }
  }
}
