import 'server-only'

import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'
import {
  caregiverClockSchema,
  caregiverTaskCompletionSchema,
  caregiverVisitNotesSchema,
} from '@/lib/schemas/caregiver-visit-execution'

export type ActiveCaregiverActor = {
  id: string
  role: 'staff_member'
  agencyId: string
  caregiverMemberId: string
}

type Visit = {
  id: string
  agency_id: string
  patient_id: string
  caregiver_member_id: string
  service_type: string | null
  status: string
}

export type CaregiverVisitMutationResult = { ok?: true; error?: string }
class AccessError extends Error {}

function publicError(error: unknown, fallback: string): string {
  return error instanceof AccessError ? error.message : fallback
}

export async function withActiveCaregiver<T>(
  userId: string,
  run: (actor: ActiveCaregiverActor) => Promise<T>
): Promise<T> {
  if (!z.uuid().safeParse(userId).success) throw new AccessError('You must be signed in.')
  return withActorContext(userId, async () => {
    const [row] = await sql<{
      id: string
      role: string
      agency_id: string
      caregiver_member_id: string
    }[]>`
      SELECT profile.id, profile.role, profile.agency_id, member.id AS caregiver_member_id
      FROM public.user_profiles profile
      JOIN public.user_agency_roles membership
        ON membership.user_id = profile.id
       AND membership.agency_id = profile.agency_id
       AND membership.role = profile.role
       AND membership.status = 'active'
      JOIN public.caregiver_members member
        ON member.user_id = profile.id
       AND member.agency_id = profile.agency_id
       AND member.status = 'active'
      WHERE profile.id = ${userId}::uuid
        AND profile.is_active = true
        AND profile.role = 'staff_member'
      LIMIT 1
    `
    if (!row?.agency_id || !row.caregiver_member_id) {
      throw new AccessError('An active caregiver account and agency membership are required.')
    }
    const actor: ActiveCaregiverActor = {
      id: row.id,
      role: 'staff_member',
      agencyId: row.agency_id,
      caregiverMemberId: row.caregiver_member_id,
    }
    await sql`SELECT set_config('app.current_user_role','staff_member',true),
      set_config('app.current_agency_id',${actor.agencyId},true)`
    return run(actor)
  })
}

async function sessionUserId(): Promise<string> {
  const session = await getSession()
  if (!session || !z.uuid().safeParse(session.user.id).success) throw new AccessError('You must be signed in.')
  return session.user.id
}

async function assignedVisit(actor: ActiveCaregiverActor, visitId: string): Promise<Visit> {
  const [visit] = await sql<Visit[]>`
    SELECT id,agency_id,patient_id,caregiver_member_id,service_type,status
    FROM public.scheduled_visits
    WHERE id=${visitId}::uuid AND agency_id=${actor.agencyId}::uuid
      AND caregiver_member_id=${actor.caregiverMemberId}::uuid
    FOR UPDATE
  `
  if (!visit) throw new AccessError('Visit was not found or is not assigned to you.')
  return visit
}

async function audit(
  actor: ActiveCaregiverActor,
  tableName: string,
  recordId: string,
  action: string,
  details: Record<string, unknown>
) {
  await sql`INSERT INTO public.audit_log
    (agency_id,table_name,record_id,action,performed_by_user_id,details)
    VALUES (${actor.agencyId}::uuid,${tableName},${recordId}::uuid,${action},${actor.id}::uuid,
      ${JSON.stringify(details)}::jsonb)`
}

export async function withAuditedActiveCaregiverRead<T>(
  userId: string,
  operation: string,
  recordId: string | null,
  run: (actor: ActiveCaregiverActor) => Promise<T>
): Promise<T> {
  return withActiveCaregiver(userId, async actor => {
    const result = await run(actor)
    await sql`INSERT INTO public.audit_log
      (agency_id,table_name,record_id,action,performed_by_user_id,details)
      VALUES (${actor.agencyId}::uuid,'scheduled_visits',${recordId}::uuid,'READ',${actor.id}::uuid,
        ${JSON.stringify({ operation })}::jsonb)`
    return result
  })
}

export async function clockInCaregiverVisit(input: unknown): Promise<CaregiverVisitMutationResult> {
  const parsed = caregiverClockSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid clock-in request.' }
  try {
    const userId = await sessionUserId()
    await withActiveCaregiver(userId, async actor => {
      const visit = await assignedVisit(actor, parsed.data.visitId)
      if (['completed', 'missed'].includes(visit.status.toLowerCase())) {
        throw new AccessError('This visit is already completed or missed.')
      }
      const [existing] = await sql<{id:string;clock_in_time:string|null}[]>`
        SELECT id,clock_in_time FROM public.visit_time_entries
        WHERE scheduled_visit_id=${visit.id}::uuid FOR UPDATE`
      let entryId = existing?.id
      if (!existing) {
        const [created] = await sql<{id:string}[]>`
          INSERT INTO public.visit_time_entries
            (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,clock_in_time,
             clock_in_latitude,clock_in_longitude,entry_status)
          VALUES (${visit.agency_id}::uuid,${visit.id}::uuid,${visit.patient_id}::uuid,
            ${visit.caregiver_member_id}::uuid,now(),${parsed.data.latitude},${parsed.data.longitude},'pending_review')
          RETURNING id`
        if (!created) throw new Error('Clock-in did not create a time entry')
        entryId = created.id
      } else if (!existing.clock_in_time) {
        const changed = await sql<{id:string}[]>`
          UPDATE public.visit_time_entries SET clock_in_time=now(),
            clock_in_latitude=${parsed.data.latitude},clock_in_longitude=${parsed.data.longitude},updated_at=now()
          WHERE id=${existing.id}::uuid AND clock_in_time IS NULL RETURNING id`
        if (changed.length !== 1) throw new AccessError('The visit changed; reload and retry.')
      }
      await sql`UPDATE public.scheduled_visits SET status='in_progress',updated_at=now()
        WHERE id=${visit.id}::uuid`
      await audit(actor,'visit_time_entries',entryId!,existing ? (existing.clock_in_time ? 'READ' : 'UPDATE') : 'INSERT',{
        operation: existing?.clock_in_time ? 'clock_in_retry' : 'clock_in',
        scheduled_visit_id: visit.id,
        geolocation_present: parsed.data.latitude !== null,
      })
    })
    return { ok: true }
  } catch (error) {
    return { error: publicError(error, 'Could not clock in.') }
  }
}

export async function clockOutCaregiverVisit(input: unknown): Promise<CaregiverVisitMutationResult> {
  const parsed = caregiverClockSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid clock-out request.' }
  try {
    const userId = await sessionUserId()
    await withActiveCaregiver(userId, async actor => {
      const visit = await assignedVisit(actor, parsed.data.visitId)
      const [entry] = await sql<{id:string;clock_in_time:string|null;clock_out_time:string|null}[]>`
        SELECT id,clock_in_time,clock_out_time FROM public.visit_time_entries
        WHERE scheduled_visit_id=${visit.id}::uuid FOR UPDATE`
      if (!entry?.clock_in_time) throw new AccessError('Clock in before clocking out.')
      if (entry.clock_out_time) {
        await audit(actor,'visit_time_entries',entry.id,'READ',{
          operation:'clock_out_retry',scheduled_visit_id:visit.id,
        })
        return
      }
      const changed = await sql<{id:string}[]>`
        UPDATE public.visit_time_entries SET
          clock_out_time=now(),
          clock_out_latitude=${parsed.data.latitude},
          clock_out_longitude=${parsed.data.longitude},
          actual_hours=round((extract(epoch FROM (now()-clock_in_time))/3600.0)::numeric,2),
          billable_hours=coalesce(billable_hours,round((extract(epoch FROM (now()-clock_in_time))/3600.0)::numeric,2)),
          updated_at=now()
        WHERE id=${entry.id}::uuid AND clock_out_time IS NULL
        RETURNING id`
      if (changed.length !== 1) throw new AccessError('The visit changed; reload and retry.')
      await sql`UPDATE public.scheduled_visits SET status='completed',updated_at=now()
        WHERE id=${visit.id}::uuid`
      await audit(actor,'visit_time_entries',entry.id,'UPDATE',{
        operation:'clock_out',scheduled_visit_id:visit.id,
        geolocation_present:parsed.data.latitude !== null,
      })
    })
    return { ok: true }
  } catch (error) {
    return { error: publicError(error, 'Could not clock out.') }
  }
}

export async function setCaregiverVisitTaskCompleted(input: unknown): Promise<CaregiverVisitMutationResult> {
  const parsed = caregiverTaskCompletionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid task request.' }
  try {
    const userId = await sessionUserId()
    await withActiveCaregiver(userId, async actor => {
      const visit = await assignedVisit(actor, parsed.data.visitId)
      const changed = await sql<{id:string}[]>`
        UPDATE public.scheduled_visit_tasks SET
          completed_at=CASE WHEN ${parsed.data.completed} THEN now() ELSE NULL END,
          updated_at=now()
        WHERE id=${parsed.data.scheduledVisitTaskId}::uuid
          AND scheduled_visit_id=${visit.id}::uuid
          AND agency_id=${visit.agency_id}::uuid
        RETURNING id`
      if (changed.length !== 1) throw new AccessError('Task not found.')
      await audit(actor,'scheduled_visit_tasks',changed[0]!.id,'UPDATE',{
        operation:'set_task_completion',scheduled_visit_id:visit.id,completed:parsed.data.completed,
      })
    })
    return { ok: true }
  } catch (error) {
    return { error: publicError(error, 'Could not update task.') }
  }
}

export async function saveCaregiverVisitNotes(input: unknown): Promise<CaregiverVisitMutationResult> {
  const parsed = caregiverVisitNotesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid visit notes.' }
  try {
    const userId = await sessionUserId()
    await withActiveCaregiver(userId, async actor => {
      const visit = await assignedVisit(actor, parsed.data.visitId)
      const [changed] = await sql<{id:string}[]>`
        UPDATE public.visit_time_entries SET caregiver_notes=${parsed.data.notes || null},updated_at=now()
        WHERE scheduled_visit_id=${visit.id}::uuid
          AND agency_id=${visit.agency_id}::uuid
          AND caregiver_member_id=${actor.caregiverMemberId}::uuid
        RETURNING id`
      if (!changed) throw new AccessError('Clock in first to add visit notes.')
      await audit(actor,'visit_time_entries',changed.id,'UPDATE',{
        operation:'save_caregiver_notes',scheduled_visit_id:visit.id,note_length:parsed.data.notes.length,
      })
    })
    return { ok: true }
  } catch (error) {
    return { error: publicError(error, 'Could not save notes.') }
  }
}
