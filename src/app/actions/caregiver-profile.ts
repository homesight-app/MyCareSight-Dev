'use server'

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { readCaregiverPayRates } from '@/lib/repositories/caregiver-pay-rates'

export type CaregiverPayRateHistoryRow = {
  id: string
  pay_rate: number | null
  unit_type: string | null
  service_type: string | null
  effective_start: string
  effective_end: string | null
  created_at: string
}

export type CaregiverScheduleRow = {
  id: string
  patient_id: string | null
  visit_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  service_type: string | null
  status: string | null
  is_recurring: boolean | null
}

const PLATFORM_ROLES = new Set(['admin', 'expert'])

async function resolveAuthorizedCaregiver(
  caregiverMemberId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>
): Promise<{ id: string; agency_id: string | null } | null> {
  const role = session.profile?.role ?? ''
  const viewerAgencyId = session.profile?.agency_id ?? null
  const [member] = await sql<{ id: string; agency_id: string | null; user_id: string | null }[]>`
    SELECT id, agency_id, user_id
    FROM caregiver_members
    WHERE id = ${caregiverMemberId}
    LIMIT 1
  `
  if (!member) return null
  if (PLATFORM_ROLES.has(role)) return member
  if (member.user_id === session.user.id) return member
  if (viewerAgencyId && member.agency_id === viewerAgencyId) return member
  return null
}

export async function getCaregiverPayRateHistoryAction(
  caregiverMemberId: string
): Promise<{ data: CaregiverPayRateHistoryRow[]; error: string | null }> {
  const result = await readCaregiverPayRates({ caregiverIds: [caregiverMemberId] })
  return { data: result.data ?? [], error: result.error }
}

export async function getCaregiverSchedulesAction(
  caregiverMemberId: string,
  todayYmd: string
): Promise<{ data: CaregiverScheduleRow[]; error: string | null }> {
  const session = await getSession()
  if (!session) return { data: [], error: 'Not authenticated' }
  const today = /^\d{4}-\d{2}-\d{2}$/.test(todayYmd) ? todayYmd : new Date().toISOString().slice(0, 10)

  return withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const member = await resolveAuthorizedCaregiver(caregiverMemberId, session)
    if (!member?.agency_id) return { data: [], error: 'Caregiver not found or not authorized' }

    const upcomingRows = await sql<CaregiverScheduleRow[]>`
      SELECT id, patient_id, visit_date, scheduled_start_time, scheduled_end_time, service_type, status, is_recurring
      FROM scheduled_visits
      WHERE caregiver_member_id = ${caregiverMemberId}
        AND agency_id = ${member.agency_id}
        AND visit_date >= ${today}
      ORDER BY visit_date ASC
      LIMIT 20
    `
    if (upcomingRows.length > 0) return { data: upcomingRows, error: null }

    const recentRows = await sql<CaregiverScheduleRow[]>`
      SELECT id, patient_id, visit_date, scheduled_start_time, scheduled_end_time, service_type, status, is_recurring
      FROM scheduled_visits
      WHERE caregiver_member_id = ${caregiverMemberId}
        AND agency_id = ${member.agency_id}
      ORDER BY visit_date DESC
      LIMIT 10
    `
    return { data: recentRows, error: null }
  })
}
