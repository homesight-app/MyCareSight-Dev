import sql from '@/db'

export type ScheduleAssignmentStatus = 'pending' | 'approved' | 'declined'

export interface ScheduleAssignmentRequestRow {
  id: string
  schedule_id: string
  caregiver_member_id: string
  status: ScheduleAssignmentStatus
  caregiver_note: string | null
  decline_reason: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

/** Pending assignment requests. */
export async function getPendingScheduleAssignmentRequests(agencyId?: string | null): Promise<{
  data: ScheduleAssignmentRequestRow[] | null
  error: Error | null
}> {
  try {
    const agencyFilter = agencyId
      ? sql`AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = schedule_assignment_requests.schedule_id
            AND sv.agency_id = ${agencyId}
        )`
      : sql``
    const rows = await sql`
      SELECT
        id, schedule_id, caregiver_member_id, status, caregiver_note,
        decline_reason, resolved_at, resolved_by, created_at, updated_at
      FROM schedule_assignment_requests
      WHERE status = 'pending'
      ${agencyFilter}
      ORDER BY created_at ASC
    `
    return { data: rows as unknown as ScheduleAssignmentRequestRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Recently resolved requests for coordinator history. */
export async function getRecentResolvedScheduleAssignmentRequests(
  limit = 40,
  agencyId?: string | null
): Promise<{ data: ScheduleAssignmentRequestRow[] | null; error: Error | null }> {
  try {
    const agencyFilter = agencyId
      ? sql`AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = schedule_assignment_requests.schedule_id
            AND sv.agency_id = ${agencyId}
        )`
      : sql``
    const rows = await sql`
      SELECT
        id, schedule_id, caregiver_member_id, status, caregiver_note,
        decline_reason, resolved_at, resolved_by, created_at, updated_at
      FROM schedule_assignment_requests
      WHERE status IN ('approved', 'declined')
        AND resolved_at IS NOT NULL
        ${agencyFilter}
      ORDER BY resolved_at DESC
      LIMIT ${limit}
    `
    return { data: rows as unknown as ScheduleAssignmentRequestRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function approveScheduleAssignmentRequestRpc(
  requestId: string
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT approve_schedule_assignment_request(${requestId}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function declineScheduleAssignmentRequestRpc(
  requestId: string,
  reason: string | null
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT decline_schedule_assignment_request(${requestId}, ${reason ?? ''}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Caregiver submits a request via RPC. */
export async function submitScheduleAssignmentRequestRpc(
  scheduleId: string,
  caregiverNote: string | null
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT submit_schedule_assignment_request(${scheduleId}, ${caregiverNote ?? ''}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Caregiver withdraws their pending request via RPC. */
export async function cancelScheduleAssignmentRequestRpc(
  requestId: string
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT cancel_schedule_assignment_request(${requestId}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Direct insert (coordinator tooling / tests). Prefer {@link submitScheduleAssignmentRequestRpc} for caregivers. */
export async function insertScheduleAssignmentRequest(
  data: { schedule_id: string; caregiver_member_id: string; caregiver_note?: string | null }
): Promise<{ data: { id: string } | null; error: Error | null }> {
  try {
    const rows = await sql`
      INSERT INTO schedule_assignment_requests
        (schedule_id, caregiver_member_id, status, caregiver_note)
      VALUES
        (${data.schedule_id}, ${data.caregiver_member_id}, 'pending', ${data.caregiver_note ?? null})
      RETURNING id
    `
    return { data: (rows[0] ?? null) as { id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export type ScheduleUnassignmentRequestRow = {
  id: string
  schedule_id: string
  caregiver_member_id: string
  status: ScheduleAssignmentStatus
  decline_reason: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

export async function getPendingScheduleUnassignmentRequests(agencyId?: string | null): Promise<{
  data: ScheduleUnassignmentRequestRow[] | null
  error: Error | null
}> {
  try {
    const agencyFilter = agencyId
      ? sql`AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = schedule_unassignment_requests.schedule_id
            AND sv.agency_id = ${agencyId}
        )`
      : sql``
    const rows = await sql`
      SELECT
        id, schedule_id, caregiver_member_id, status,
        decline_reason, resolved_at, resolved_by, created_at, updated_at
      FROM schedule_unassignment_requests
      WHERE status = 'pending'
      ${agencyFilter}
      ORDER BY created_at ASC
    `
    return { data: rows as unknown as ScheduleUnassignmentRequestRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Recently resolved unassignment requests for coordinator history. */
export async function getRecentResolvedScheduleUnassignmentRequests(
  limit = 40,
  agencyId?: string | null
): Promise<{ data: ScheduleUnassignmentRequestRow[] | null; error: Error | null }> {
  try {
    const agencyFilter = agencyId
      ? sql`AND EXISTS (
          SELECT 1 FROM scheduled_visits sv
          WHERE sv.id = schedule_unassignment_requests.schedule_id
            AND sv.agency_id = ${agencyId}
        )`
      : sql``
    const rows = await sql`
      SELECT
        id, schedule_id, caregiver_member_id, status,
        decline_reason, resolved_at, resolved_by, created_at, updated_at
      FROM schedule_unassignment_requests
      WHERE status IN ('approved', 'declined')
        AND resolved_at IS NOT NULL
        ${agencyFilter}
      ORDER BY resolved_at DESC
      LIMIT ${limit}
    `
    return { data: rows as unknown as ScheduleUnassignmentRequestRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function submitScheduleUnassignmentRequestRpc(
  scheduleId: string
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT submit_schedule_unassignment_request(${scheduleId}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function approveScheduleUnassignmentRequestRpc(
  requestId: string
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT approve_schedule_unassignment_request(${requestId}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function declineScheduleUnassignmentRequestRpc(
  requestId: string,
  reason: string | null
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT decline_schedule_unassignment_request(${requestId}, ${reason ?? ''}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function cancelScheduleUnassignmentRequestRpc(
  requestId: string
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const rows = await sql`SELECT cancel_schedule_unassignment_request(${requestId}) AS result`
    return { data: rows[0]?.result ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
