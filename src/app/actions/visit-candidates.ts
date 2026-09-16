'use server'

import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import { computeCaregiverMatches } from '@/lib/caregiver-matching'
import type { CaregiverMatchOption } from '@/lib/caregiver-matching'

export type { CaregiverMatchOption }

/** Fetch and rank caregiver candidates for a single visit (called on-demand when the assign modal opens). */
export async function getCaregiverCandidatesForVisitAction(
  visitId: string
): Promise<{ data: CaregiverMatchOption[] | null; error: string | null }> {
  const session = await getSession()
  if (!session?.user?.id) return { data: null, error: 'Not authenticated' }

  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null
  const canCrossAgency = role === 'admin' || role === 'expert'
  if (!agencyId && !canCrossAgency) return { data: null, error: 'No agency context' }

  return withUserContext(session.user.id, role, agencyId, async () => {
    const [visit] = await sql<{
      patient_id: string
      caregiver_member_id: string | null
      visit_date: string | null
      scheduled_start_time: string | null
      scheduled_end_time: string | null
      agency_id: string | null
    }[]>`
      SELECT patient_id, caregiver_member_id, visit_date, scheduled_start_time, scheduled_end_time, agency_id
      FROM scheduled_visits
      WHERE id = ${visitId}
      LIMIT 1
    `
    if (!visit) return { data: null, error: 'Visit not found' }

    // Verify visit belongs to the viewer's agency (non-admin roles are agency-scoped)
    if (agencyId && visit.agency_id !== agencyId) return { data: null, error: 'Visit not found' }

    const patientId = visit.patient_id
    const visitAgencyId = agencyId ?? (canCrossAgency ? visit.agency_id : null)
    if (!visitAgencyId) return { data: null, error: 'Visit not found' }
    const currentCaregiverId = visit.caregiver_member_id ?? null
    const visitDate = visit.visit_date ?? null
    const visitStart = visit.scheduled_start_time ?? null
    const visitEnd = visit.scheduled_end_time ?? null

    const [patientRow, reqRes, allStaff] = await Promise.all([
      // patients RLS: only returns row if viewer's agency matches
      sql<{ zip_code: string | null }[]>`SELECT zip_code FROM patients WHERE id = ${patientId} LIMIT 1`,
      q.getCaregiverRequirementsByPatientId(patientId),
      visitAgencyId
        ? sql<{
            id: string
            first_name: string | null
            last_name: string | null
            zip_code: string | null
            skills: string[] | null
            role: string | null
            job_title: string | null
            phone: string | null
          }[]>`
            SELECT id, first_name, last_name, zip_code, skills, role, job_title, phone
            FROM caregiver_members
            WHERE agency_id = ${visitAgencyId}
            ORDER BY first_name ASC
          `
        : Promise.resolve([]),
    ])

    const staffIds = allStaff.map((s) => s.id)
    const [slotsRes, conflictRows] = await Promise.all([
      q.getCaregiverAvailabilitySlotsByCaregiverIds(staffIds),
      visitDate
        ? sql<{
            id: string
            caregiver_member_id: string | null
            scheduled_start_time: string | null
            scheduled_end_time: string | null
          }[]>`
            SELECT id, caregiver_member_id, scheduled_start_time, scheduled_end_time
            FROM scheduled_visits
            WHERE visit_date = ${visitDate}
              AND agency_id = ${visitAgencyId}
              AND caregiver_member_id IS NOT NULL
              AND id != ${visitId}
              AND status != 'cancelled'
          `
        : Promise.resolve([]),
    ])

    const requiredSkills: string[] = Array.isArray(reqRes.data?.skill_codes) ? reqRes.data.skill_codes : []

    const conflicts = conflictRows.map((c) => ({
      id: c.id,
      caregiver_id: c.caregiver_member_id ?? null,
      start_time: c.scheduled_start_time ?? null,
      end_time: c.scheduled_end_time ?? null,
    }))

    const candidates = computeCaregiverMatches({
      staff: allStaff,
      slots: (slotsRes.data ?? []).map((s) => ({
        caregiver_member_id: s.caregiver_member_id,
        is_recurring: s.is_recurring,
        start_time: s.start_time,
        end_time: s.end_time,
        days_of_week: s.days_of_week,
        repeat_start: s.repeat_start,
        repeat_end: s.repeat_end,
        specific_date: s.specific_date,
      })),
      conflicts,
      requiredSkills,
      clientZip: patientRow[0]?.zip_code ?? null,
      visitDate,
      visitStart,
      visitEnd,
      currentCaregiverId,
      excludeConflictId: visitId,
    })

    return { data: candidates, error: null }
  })
}
