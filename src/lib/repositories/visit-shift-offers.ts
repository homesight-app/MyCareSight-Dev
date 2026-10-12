import 'server-only'

import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'
import { loadVisitCaregiverCandidatesForActor } from '@/lib/repositories/visit-caregiver-candidates'
import { eligibleCaregiverCandidates } from '@/lib/caregiver-matching'
import type {
  PublishVisitShiftOfferInput,
  RespondToVisitShiftOfferInput,
} from '@/lib/schemas/visit-shift-offers'

type RepositoryResult<T> = { data: T | null; error: Error | null }

export type PublishedShiftOffer = {
  offerId: string
  notifiedCount: number
  newlyNotifiedCount: number
}

export type ShiftOfferResponse = {
  offerId: string
  response: 'interested' | 'not_interested'
  requestId: string | null
}

type CaregiverActor = {
  id: string
  agencyId: string
  caregiverMemberId: string
}

class ShiftOfferError extends Error {}

function publicError(error: unknown, fallback: string): Error {
  return new Error(error instanceof ShiftOfferError ? error.message : fallback)
}

function safeServiceLabel(serviceType: string): string {
  if (serviceType === 'skilled') return 'skilled care'
  if (serviceType === 'non_skilled') return 'non-skilled care'
  return 'care'
}

function formatShiftDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatShiftTime(value: string): string {
  const raw = value.slice(0, 5)
  const [hours, minutes] = raw.split(':').map(Number)
  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes))
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

async function withActiveCaregiver<T>(run: (actor: CaregiverActor) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session || !z.uuid().safeParse(session.user.id).success) {
    throw new ShiftOfferError('You must be signed in.')
  }

  return withActorContext(session.user.id, async () => {
    const [actor] = await sql<{ id: string; agency_id: string }[]>`
      SELECT profile.id, profile.agency_id
      FROM public.user_profiles profile
      JOIN public.user_agency_roles membership
        ON membership.user_id = profile.id
       AND membership.agency_id = profile.agency_id
       AND membership.role = 'staff_member'
       AND membership.status = 'active'
      WHERE profile.id = ${session.user.id}::uuid
        AND profile.role = 'staff_member'
        AND profile.is_active = true
        AND profile.agency_id IS NOT NULL
      LIMIT 1
    `
    if (!actor) throw new ShiftOfferError('Your caregiver membership is not active.')

    const [caregiver] = await sql<{ id: string }[]>`
      SELECT id
      FROM public.caregiver_members
      WHERE user_id = ${actor.id}::uuid
        AND agency_id = ${actor.agency_id}::uuid
        AND status = 'active'
      ORDER BY updated_at DESC, id
      LIMIT 1
    `
    if (!caregiver) throw new ShiftOfferError('Your caregiver profile is not active.')

    await sql`
      SELECT set_config('app.current_user_role', 'staff_member', true),
        set_config('app.current_agency_id', ${actor.agency_id}, true)
    `
    return run({ id: actor.id, agencyId: actor.agency_id, caregiverMemberId: caregiver.id })
  })
}

export async function publishVisitShiftOffer(
  input: PublishVisitShiftOfferInput
): Promise<RepositoryResult<PublishedShiftOffer>> {
  try {
    const data = await withAgencyManagerFinancialRead(async actor => {
      const [visit] = await sql<{
        id: string
        agency_id: string
        caregiver_member_id: string | null
        visit_date: string
        scheduled_start_time: string | null
        scheduled_end_time: string | null
        status: string
        service_type: string
      }[]>`
        SELECT id, agency_id, caregiver_member_id, visit_date, scheduled_start_time,
          scheduled_end_time, status, service_type
        FROM public.scheduled_visits
        WHERE id = ${input.visitId}::uuid AND agency_id = ${actor.agencyId}::uuid
        FOR UPDATE
      `
      if (!visit) throw new ShiftOfferError('Visit not found in your agency.')
      if (visit.caregiver_member_id) throw new ShiftOfferError('This visit already has an assigned caregiver.')
      if (!['scheduled', 'unassigned'].includes(visit.status)) {
        throw new ShiftOfferError('Only an open, unassigned visit can be advertised.')
      }
      if (visit.visit_date < new Date().toISOString().slice(0, 10)) {
        throw new ShiftOfferError('Past visits cannot be advertised.')
      }
      if (!visit.scheduled_start_time || !visit.scheduled_end_time) {
        throw new ShiftOfferError('Set the visit start and end time before advertising it.')
      }
      const startsAt = Date.parse(`${visit.visit_date}T${visit.scheduled_start_time.slice(0, 8)}Z`)
      if (!Number.isFinite(startsAt) || startsAt <= Date.now()) {
        throw new ShiftOfferError('Only a future shift can be advertised.')
      }

      const candidateResult = await loadVisitCaregiverCandidatesForActor(actor, input.visitId)
      const eligible = eligibleCaregiverCandidates(candidateResult.candidates)
      const eligibleById = new Map(eligible.map(candidate => [candidate.id, candidate]))
      const requestedIds = Array.from(new Set(input.caregiverIds))
      const recipientIds = input.audienceMode === 'all_eligible'
        ? eligible.map(candidate => candidate.id)
        : requestedIds

      if (input.audienceMode === 'selected') {
        const invalidSelection = recipientIds.find(id => !eligibleById.has(id))
        if (invalidSelection) {
          throw new ShiftOfferError('One or more selected caregivers are no longer eligible for this shift.')
        }
      }
      if (recipientIds.length === 0) {
        throw new ShiftOfferError('No active, available, fully qualified caregivers were found for this shift.')
      }

      let [offer] = await sql<{ id: string }[]>`
        SELECT id
        FROM public.visit_shift_offers
        WHERE scheduled_visit_id = ${visit.id}::uuid AND status = 'open'
        FOR UPDATE
      `
      if (!offer) {
        ;[offer] = await sql<{ id: string }[]>`
          INSERT INTO public.visit_shift_offers (
            agency_id, scheduled_visit_id, created_by_user_id, audience_mode, status, expires_at
          ) VALUES (
            ${actor.agencyId}::uuid,
            ${visit.id}::uuid,
            ${actor.id}::uuid,
            ${input.audienceMode},
            'open',
            (${visit.visit_date}::date + ${visit.scheduled_start_time}::time) AT TIME ZONE 'UTC'
          )
          RETURNING id
        `
      } else if (input.audienceMode === 'all_eligible') {
        await sql`
          UPDATE public.visit_shift_offers
          SET audience_mode = 'all_eligible', updated_at = now()
          WHERE id = ${offer.id}::uuid
        `
      }
      if (!offer) throw new Error('Shift offer was not created.')

      const newRecipients = await sql<{
        id: string
        user_id: string
      }[]>`
        INSERT INTO public.visit_shift_offer_recipients (
          offer_id, agency_id, caregiver_member_id, user_id, status
        )
        SELECT ${offer.id}::uuid, ${actor.agencyId}::uuid, caregiver.id, caregiver.user_id, 'notified'
        FROM public.caregiver_members caregiver
        JOIN public.user_profiles profile
          ON profile.id = caregiver.user_id
         AND profile.agency_id = caregiver.agency_id
         AND profile.role = 'staff_member'
         AND profile.is_active = true
        JOIN public.user_agency_roles membership
          ON membership.user_id = profile.id
         AND membership.agency_id = caregiver.agency_id
         AND membership.role = 'staff_member'
         AND membership.status = 'active'
        WHERE caregiver.id = ANY(${recipientIds}::uuid[])
          AND caregiver.agency_id = ${actor.agencyId}::uuid
          AND caregiver.status = 'active'
          AND caregiver.user_id IS NOT NULL
        ON CONFLICT (offer_id, caregiver_member_id) DO NOTHING
        RETURNING id, user_id
      `

      if (newRecipients.length > 0) {
        const title = 'Open shift available'
        const message = `${formatShiftDate(visit.visit_date)}, ${formatShiftTime(visit.scheduled_start_time)}–${formatShiftTime(visit.scheduled_end_time)} · ${safeServiceLabel(visit.service_type)}. Open My Care Visits to respond.`
        const actionUrl = `/pages/caregiver/my-care-visits?tab=scheduling&visit=${visit.id}`
        await sql`
          INSERT INTO public.notifications ${sql(
            newRecipients.map(recipient => ({
              user_id: recipient.user_id,
              title,
              message,
              type: 'general',
              icon_type: 'bell',
              action_url: actionUrl,
            })),
            'user_id', 'title', 'message', 'type', 'icon_type', 'action_url'
          )}
        `
      }

      const [recipientCount] = await sql<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM public.visit_shift_offer_recipients
        WHERE offer_id = ${offer.id}::uuid
      `
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${actor.agencyId}::uuid,
          'visit_shift_offers',
          ${offer.id}::uuid,
          'PUBLISH',
          ${actor.id}::uuid,
          ${JSON.stringify({
            operation: 'publish_open_shift',
            visit_id: visit.id,
            audience_mode: input.audienceMode,
            newly_notified_count: newRecipients.length,
            total_notified_count: Number(recipientCount?.count ?? 0),
          })}::jsonb
        )
      `

      return {
        offerId: offer.id,
        notifiedCount: Number(recipientCount?.count ?? 0),
        newlyNotifiedCount: newRecipients.length,
      }
    })
    return { data, error: null }
  } catch (error) {
    return { data: null, error: publicError(error, 'Unable to advertise this shift.') }
  }
}

export async function respondToVisitShiftOffer(
  input: RespondToVisitShiftOfferInput
): Promise<RepositoryResult<ShiftOfferResponse>> {
  try {
    const data = await withActiveCaregiver(async actor => {
      const [recipient] = await sql<{
        id: string
        offer_id: string
        status: string
        scheduled_visit_id: string
        offer_status: string
        expires_at: string
        visit_status: string
        caregiver_member_id: string | null
      }[]>`
        SELECT recipient.id, recipient.offer_id, recipient.status,
          offer.scheduled_visit_id, offer.status AS offer_status, offer.expires_at,
          visit.status AS visit_status, visit.caregiver_member_id
        FROM public.visit_shift_offer_recipients recipient
        JOIN public.visit_shift_offers offer ON offer.id = recipient.offer_id
        JOIN public.scheduled_visits visit ON visit.id = offer.scheduled_visit_id
        WHERE recipient.offer_id = ${input.offerId}::uuid
          AND recipient.user_id = ${actor.id}::uuid
          AND recipient.caregiver_member_id = ${actor.caregiverMemberId}::uuid
          AND recipient.agency_id = ${actor.agencyId}::uuid
        FOR UPDATE OF recipient
      `
      if (!recipient) throw new ShiftOfferError('This shift invitation was not found.')
      if (recipient.offer_status !== 'open' || new Date(recipient.expires_at).getTime() <= Date.now()) {
        throw new ShiftOfferError('This shift invitation is no longer open.')
      }
      if (recipient.caregiver_member_id || !['scheduled', 'unassigned'].includes(recipient.visit_status)) {
        throw new ShiftOfferError('This shift has already been filled or closed.')
      }

      let requestId: string | null = null
      if (input.response === 'interested') {
        const [existing] = await sql<{ id: string }[]>`
          SELECT id
          FROM public.schedule_assignment_requests
          WHERE schedule_id = ${recipient.scheduled_visit_id}::uuid
            AND caregiver_member_id = ${actor.caregiverMemberId}::uuid
            AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `
        if (existing) {
          requestId = existing.id
          await sql`
            UPDATE public.schedule_assignment_requests
            SET shift_offer_recipient_id = ${recipient.id}::uuid, updated_at = now()
            WHERE id = ${existing.id}::uuid
          `
        } else {
          const [created] = await sql<{ id: string }[]>`
            INSERT INTO public.schedule_assignment_requests (
              schedule_id, caregiver_member_id, status, caregiver_note, shift_offer_recipient_id
            ) VALUES (
              ${recipient.scheduled_visit_id}::uuid,
              ${actor.caregiverMemberId}::uuid,
              'pending',
              ${input.caregiverNote?.trim() || null},
              ${recipient.id}::uuid
            )
            RETURNING id
          `
          requestId = created?.id ?? null
        }

        const managerIds = await sql<{ id: string }[]>`
          SELECT DISTINCT profile.id
          FROM public.user_profiles profile
          JOIN public.user_agency_roles membership
            ON membership.user_id = profile.id
           AND membership.agency_id = profile.agency_id
           AND membership.role = profile.role
           AND membership.status = 'active'
          WHERE profile.agency_id = ${actor.agencyId}::uuid
            AND profile.is_active = true
            AND profile.role IN ('company_owner', 'care_coordinator')
        `
        if (managerIds.length > 0) {
          await sql`
            INSERT INTO public.notifications ${sql(
              managerIds.map(manager => ({
                user_id: manager.id,
                title: 'Open shift response',
                message: 'A caregiver is interested in an advertised shift.',
                type: 'general',
                icon_type: 'bell',
                action_url: '/pages/agency/care-visits?tab=requests&subtab=assignment',
              })),
              'user_id', 'title', 'message', 'type', 'icon_type', 'action_url'
            )}
          `
        }
      }

      await sql`
        UPDATE public.visit_shift_offer_recipients
        SET status = ${input.response}, responded_at = now(), updated_at = now()
        WHERE id = ${recipient.id}::uuid
      `
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${actor.agencyId}::uuid,
          'visit_shift_offer_recipients',
          ${recipient.id}::uuid,
          'RESPOND',
          ${actor.id}::uuid,
          ${JSON.stringify({
            operation: 'respond_to_open_shift',
            offer_id: recipient.offer_id,
            visit_id: recipient.scheduled_visit_id,
            response: input.response,
          })}::jsonb
        )
      `

      return { offerId: recipient.offer_id, response: input.response, requestId }
    })
    return { data, error: null }
  } catch (error) {
    return { data: null, error: publicError(error, 'Unable to respond to this shift invitation.') }
  }
}
