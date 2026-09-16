'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { CACHE_TAG_CAREGIVER_VISIT_EXECUTION, caregiverVisitExecutionTag } from '@/lib/cache-tags'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import { fetchCaregiverPastVisitSummary } from '@/lib/caregiver-visit-execution'
import type { CaregiverPastVisitSummaryDTO } from '@/lib/caregiver-visit-execution'

const CAREGIVER_VISITS = '/pages/caregiver/my-care-visits'

function revalidateVisitPages(visitId: string) {
  revalidatePath(CAREGIVER_VISITS)
  revalidatePath(CAREGIVER_VISITS, 'layout')
  revalidatePath(`${CAREGIVER_VISITS}/${visitId}`)
  revalidateTag(caregiverVisitExecutionTag(visitId))
  revalidateTag(CACHE_TAG_CAREGIVER_VISIT_EXECUTION)
}

type RpcOk = { ok?: boolean; error?: string; already_clocked_out?: boolean }

function mapMissingRpcMessage(raw: string | undefined): string | null {
  const m = raw ?? ''
  if (/could not find the function|schema cache|42883|does not exist/i.test(m)) {
    return (
      'Clock-in is not available on this environment yet. Apply migration ' +
      '`054_caregiver_visit_clock_evv_and_tasks.sql` to the linked database, ' +
      'then retry.'
    )
  }
  return null
}

function mapClockError(code: string | undefined): string {
  switch (code) {
    case 'not_caregiver': return 'You must be signed in as a caregiver.'
    case 'not_found':     return 'Visit was not found.'
    case 'forbidden':     return 'You are not assigned to this visit.'
    case 'visit_closed':  return 'This visit is already completed or missed.'
    case 'not_clocked_in': return 'Clock in before clocking out.'
    default:              return 'Something went wrong. Please try again.'
  }
}

export async function caregiverClockInAction(
  visitId: string,
  latitude: number | null,
  longitude: number | null
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  try {
    const [row] = await sql<{ body: RpcOk | null }[]>`
      SELECT caregiver_clock_in_visit(
        p_scheduled_visit_id => ${visitId}::uuid,
        p_latitude           => ${latitude},
        p_longitude          => ${longitude}
      ) AS body
    `
    const body = row?.body
    if (!body?.ok) return { error: mapClockError(body?.error) }
  } catch (err: any) {
    return { error: mapMissingRpcMessage(err.message) ?? err.message ?? 'Could not clock in.' }
  }

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function caregiverClockOutAction(
  visitId: string,
  latitude: number | null,
  longitude: number | null
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  try {
    const [row] = await sql<{ body: RpcOk | null }[]>`
      SELECT caregiver_clock_out_visit(
        p_scheduled_visit_id => ${visitId}::uuid,
        p_latitude           => ${latitude},
        p_longitude          => ${longitude}
      ) AS body
    `
    const body = row?.body
    if (!body?.ok) return { error: mapClockError(body?.error) }
  } catch (err: any) {
    return { error: mapMissingRpcMessage(err.message) ?? err.message ?? 'Could not clock out.' }
  }

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function caregiverSetTaskCompletedAction(
  visitId: string,
  scheduledVisitTaskId: string,
  completed: boolean
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  try {
    const [row] = await sql<{ body: RpcOk | null }[]>`
      SELECT caregiver_set_scheduled_visit_task_completed(
        p_scheduled_visit_task_id => ${scheduledVisitTaskId}::uuid,
        p_completed               => ${completed}
      ) AS body
    `
    const body = row?.body
    if (!body?.ok) {
      return { error: body?.error === 'not_found_or_forbidden' ? 'Task not found.' : 'Could not update task.' }
    }
  } catch (err: any) {
    return { error: mapMissingRpcMessage(err.message) ?? err.message ?? 'Could not update task.' }
  }

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function caregiverSaveVisitNotesAction(
  visitId: string,
  notes: string
): Promise<{ ok?: true; error?: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  const trimmed = notes.trim()
  try {
    const [updated] = await sql<{ id: string }[]>`
      UPDATE visit_time_entries
      SET caregiver_notes = ${trimmed || null}, updated_at = ${new Date().toISOString()}
      WHERE scheduled_visit_id = ${visitId}
      RETURNING id
    `
    if (!updated) return { error: 'Clock in first to add visit notes.' }
  } catch (err: any) {
    return { error: err.message || 'Could not save notes.' }
  }

  revalidateVisitPages(visitId)
  return { ok: true }
}

export async function getCaregiverPastVisitSummaryAction(
  visitId: string
): Promise<{ summary: CaregiverPastVisitSummaryDTO } | { error: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'You must be signed in.' }

  const { data: staff, error: staffErr } = await q.getStaffMemberByUserId(session.user.id)
  if (staffErr || !staff) return { error: 'Staff member record not found.' }

  const role = session.profile?.role ?? ''
  const agencyId = staff.agency_id ?? null

  const result = await withUserContext(session.user.id, role, agencyId, () =>
    fetchCaregiverPastVisitSummary(visitId, staff.id, agencyId)
  )
  if (!result.data) return { error: result.error ?? 'Could not load visit summary.' }
  return { summary: result.data }
}
