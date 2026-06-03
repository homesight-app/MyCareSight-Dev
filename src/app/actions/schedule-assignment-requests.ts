'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'

const COORDINATOR_PATH = '/pages/agency/care-visits'
const CAREGIVER_PATH = '/pages/caregiver/my-care-visits'

function revalidateVisitsPages() {
  revalidatePath(COORDINATOR_PATH)
  revalidatePath(CAREGIVER_PATH)
  revalidatePath(CAREGIVER_PATH, 'layout')
}

function mapRpcError(code: string | undefined): string {
  switch (code) {
    case 'not_found':
      return 'This request was not found. Refresh the page and try again.'
    case 'not_pending':
      return 'This request is no longer pending.'
    case 'forbidden':
      return 'You are not allowed to perform this action.'
    case 'schedule_already_assigned':
      return 'This visit already has an assigned caregiver.'
    case 'visit_changed':
      return 'The visit was changed by someone else. Refresh the page and try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

function mapSubmitUnassignmentRequestError(code: string | undefined): string {
  switch (code) {
    case 'not_authenticated':
      return 'You must be signed in.'
    case 'cannot_request':
      return 'You cannot request unassignment for this visit. It may not be assigned to you.'
    case 'duplicate_pending':
      return 'You already have a pending unassignment request for this visit.'
    default:
      return 'Could not submit unassignment request.'
  }
}

type RpcPayload = { ok?: boolean; error?: string }

async function logScheduleAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: string,
  recordId: string,
  details: Record<string, unknown>
) {
  const { error } = await supabase.from('audit_log').insert({
    table_name: 'scheduled_visits',
    record_id: recordId,
    action,
    performed_by_user_id: userId,
    details,
  })
  if (error) console.error('[schedule-assignments] Audit log failed. action=%s recordId=%s err=%s', action, recordId, error.message)
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidRequestId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id !== 'null' && UUID_RE.test(id)
}

export async function approveScheduleAssignmentRequestAction(
  requestId: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  if (!isValidRequestId(requestId)) return { error: 'Invalid request. Refresh the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await q.approveScheduleAssignmentRequestRpc(supabase, requestId)

  if (error) {
    return { error: error.message }
  }

  const body = data as RpcPayload | null
  if (!body?.ok) {
    return { error: mapRpcError(body?.error) }
  }

  await logScheduleAudit(supabase, session.user.id, 'APPROVE_ASSIGNMENT', requestId, { request_id: requestId })
  revalidateVisitsPages()
  return { ok: true }
}

export async function declineScheduleAssignmentRequestAction(
  requestId: string,
  reason: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  if (!isValidRequestId(requestId)) return { error: 'Invalid request. Refresh the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await q.declineScheduleAssignmentRequestRpc(supabase, requestId, reason)

  if (error) {
    return { error: error.message }
  }

  const body = data as RpcPayload | null
  if (!body?.ok) {
    return { error: mapRpcError(body?.error) }
  }

  await logScheduleAudit(supabase, session.user.id, 'DECLINE_ASSIGNMENT', requestId, { request_id: requestId, reason })
  revalidateVisitsPages()
  return { ok: true }
}

function mapSubmitAssignmentRequestError(code: string | undefined): string {
  switch (code) {
    case 'not_authenticated':
      return 'You must be signed in.'
    case 'cannot_request':
      return 'You cannot request this visit. It may be assigned, missing agency data, or not in your agency.'
    case 'duplicate_pending':
      return 'You already have a pending request for this visit.'
    default:
      return 'Could not submit request.'
  }
}

/** Logged-in caregiver requests an open visit (same agency; visit must be unassigned). Uses DB RPC to avoid INSERT RLS issues. */
export async function requestScheduleAssignmentAction(
  scheduleId: string,
  caregiverNote?: string | null
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  const supabase = await createClient()
  const note = caregiverNote?.trim() ? caregiverNote.trim() : ''
  const { data, error } = await q.submitScheduleAssignmentRequestRpc(supabase, scheduleId, note || null)

  if (error) {
    return { error: error.message || 'Could not submit request.' }
  }

  const body = data as { ok?: boolean; error?: string } | null
  if (!body?.ok) {
    return { error: mapSubmitAssignmentRequestError(body?.error) }
  }

  await logScheduleAudit(supabase, session.user.id, 'REQUEST_ASSIGNMENT', scheduleId, { schedule_id: scheduleId, caregiver_note: note || null })
  revalidateVisitsPages()
  return { ok: true }
}

function mapCancelAssignmentRequestError(code: string | undefined): string {
  switch (code) {
    case 'not_authenticated':
      return 'You must be signed in.'
    case 'not_found':
      return 'This request was not found. Refresh the page and try again.'
    case 'not_pending':
      return 'This request is no longer pending.'
    case 'forbidden':
      return 'You are not allowed to cancel this request.'
    default:
      return 'Could not cancel request.'
  }
}

/** Caregiver cancels their own pending assignment request (RPC notifies agency staff). */
export async function cancelScheduleAssignmentRequestAction(
  requestId: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  if (!isValidRequestId(requestId)) return { error: 'Invalid request. Refresh the page and try again.' }

  const supabase = await createClient()
  const { error, data } = await q.cancelScheduleAssignmentRequestRpc(supabase, requestId)
  if (error) {
    return { error: error.message || 'Could not cancel request.' }
  }

  const body = data as RpcPayload | null
  if (!body?.ok) {
    return { error: mapCancelAssignmentRequestError(body?.error) }
  }

  await logScheduleAudit(supabase, session.user.id, 'CANCEL_ASSIGNMENT_REQUEST', requestId, { request_id: requestId })
  revalidateVisitsPages()
  return { ok: true }
}

export async function markScheduleMissedAction(
  scheduleId: string,
  reason?: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  const supabase = await createClient()
  const { data, error } = await q.updateSchedule(supabase, scheduleId, {
    status: 'missed',
    notes: reason?.trim() ? reason.trim() : null,
  })
  if (error) return { error: error.message || 'Could not mark visit as missed.' }
  if ((data?.status ?? '').toLowerCase().trim() !== 'missed') {
    return { error: 'Visit status was not updated to missed. Please refresh and try again.' }
  }
  await logScheduleAudit(supabase, session.user.id, 'MARK_MISSED', scheduleId, { schedule_id: scheduleId, reason: reason?.trim() || null })
  revalidateVisitsPages()
  return { ok: true }
}

export async function assignCaregiverToScheduleAction(
  scheduleId: string,
  caregiverId: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  const supabase = await createClient()
  const { error } = await q.updateSchedule(supabase, scheduleId, {
    caregiver_id: caregiverId,
    status: 'scheduled',
  })
  if (error) return { error: error.message || 'Could not assign caregiver.' }
  await logScheduleAudit(supabase, session.user.id, 'ASSIGN_CAREGIVER', scheduleId, { schedule_id: scheduleId, caregiver_id: caregiverId })
  revalidateVisitsPages()
  return { ok: true }
}

/** Coordinator: immediately remove caregiver from visit (no pending request). */
export async function unassignCaregiverFromScheduleAction(
  scheduleId: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  const supabase = await createClient()
  const { error } = await q.updateSchedule(supabase, scheduleId, {
    caregiver_id: null,
    status: 'scheduled',
  })
  if (error) return { error: error.message || 'Could not unassign caregiver.' }
  await logScheduleAudit(supabase, session.user.id, 'UNASSIGN_CAREGIVER', scheduleId, { schedule_id: scheduleId })
  revalidateVisitsPages()
  return { ok: true }
}

/** Caregiver: submit pending unassignment for coordinator approval. */
export async function submitScheduleUnassignmentRequestAction(
  scheduleId: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  const supabase = await createClient()
  const { data, error } = await q.submitScheduleUnassignmentRequestRpc(supabase, scheduleId)

  if (error) {
    return { error: error.message || 'Could not submit unassignment request.' }
  }

  const body = data as RpcPayload | null
  if (!body?.ok) {
    return { error: mapSubmitUnassignmentRequestError(body?.error) }
  }

  await logScheduleAudit(supabase, session.user.id, 'REQUEST_UNASSIGNMENT', scheduleId, { schedule_id: scheduleId })
  revalidateVisitsPages()
  return { ok: true }
}

/** Caregiver: cancel own pending unassignment request. */
export async function cancelScheduleUnassignmentRequestAction(
  requestId: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  if (!isValidRequestId(requestId)) return { error: 'Invalid request. Refresh the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await q.cancelScheduleUnassignmentRequestRpc(supabase, requestId)
  if (error) return { error: error.message }

  const body = data as RpcPayload | null
  if (!body?.ok) return { error: mapRpcError(body?.error) }

  await logScheduleAudit(supabase, session.user.id, 'CANCEL_UNASSIGNMENT_REQUEST', requestId, { request_id: requestId })
  revalidateVisitsPages()
  return { ok: true }
}

export async function approveScheduleUnassignmentRequestAction(
  requestId: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  if (!isValidRequestId(requestId)) return { error: 'Invalid request. Refresh the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await q.approveScheduleUnassignmentRequestRpc(supabase, requestId)

  if (error) {
    return { error: error.message }
  }

  const body = data as RpcPayload | null
  if (!body?.ok) {
    return { error: mapRpcError(body?.error) }
  }

  await logScheduleAudit(supabase, session.user.id, 'APPROVE_UNASSIGNMENT', requestId, { request_id: requestId })
  revalidateVisitsPages()
  return { ok: true }
}

export async function declineScheduleUnassignmentRequestAction(
  requestId: string,
  reason: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }
  if (!isValidRequestId(requestId)) return { error: 'Invalid request. Refresh the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await q.declineScheduleUnassignmentRequestRpc(supabase, requestId, reason)

  if (error) {
    return { error: error.message }
  }

  const body = data as RpcPayload | null
  if (!body?.ok) {
    return { error: mapRpcError(body?.error) }
  }

  await logScheduleAudit(supabase, session.user.id, 'DECLINE_UNASSIGNMENT', requestId, { request_id: requestId, reason })
  revalidateVisitsPages()
  return { ok: true }
}
