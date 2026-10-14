import 'server-only'

import sql from '@/db'
import * as q from '@/lib/supabase/query'
import { computeCaregiverMatches, type CaregiverMatchOption } from '@/lib/caregiver-matching'
import {
  withCareOperationsManager,
  type FinancialReadActor,
} from '@/lib/repositories/visit-financial-reads'

type CandidateVisit = {
  patient_id: string
  caregiver_member_id: string | null
  visit_date: string | null
  scheduled_end_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  agency_id: string
}

export type VisitCaregiverCandidateResult = {
  candidates: CaregiverMatchOption[]
  requiredSkills: string[]
  preferredSkills: string[]
  visit: CandidateVisit
}

class CandidateAccessError extends Error {}

export async function loadVisitCaregiverCandidatesForActor(
  actor: FinancialReadActor,
  visitId: string
): Promise<VisitCaregiverCandidateResult> {
  const [visit] = await sql<CandidateVisit[]>`
    SELECT patient_id, caregiver_member_id, visit_date, scheduled_end_date,
      scheduled_start_time, scheduled_end_time, agency_id
    FROM public.scheduled_visits
    WHERE id = ${visitId}::uuid AND agency_id = ${actor.agencyId}::uuid
    LIMIT 1
  `
  if (!visit) throw new CandidateAccessError('Visit not found in your agency.')

  const [patientRow, requirements, staff] = await Promise.all([
    sql<{ zip_code: string | null }[]>`
      SELECT zip_code FROM public.patients
      WHERE id = ${visit.patient_id}::uuid AND agency_id = ${actor.agencyId}::uuid
      LIMIT 1
    `,
    q.getCaregiverRequirementsByPatientId(visit.patient_id),
    sql<{
      id: string
      first_name: string | null
      last_name: string | null
      zip_code: string | null
      skills: string[] | null
      role: string | null
      job_title: string | null
      phone: string | null
    }[]>`
      SELECT caregiver.id, caregiver.first_name, caregiver.last_name, caregiver.zip_code,
        COALESCE(array_agg(skill_catalog.name ORDER BY skill_catalog.name)
          FILTER (WHERE skill_assignment.verification_status = 'verified' AND skill_catalog.is_active),
          '{}'::text[]) AS skills,
        caregiver.role, caregiver.job_title, caregiver.phone
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
      LEFT JOIN public.caregiver_skill_assignments skill_assignment
        ON skill_assignment.caregiver_member_id = caregiver.id
       AND skill_assignment.agency_id = caregiver.agency_id
      LEFT JOIN public.credential_catalog skill_catalog
        ON skill_catalog.id = skill_assignment.credential_id
      WHERE caregiver.agency_id = ${actor.agencyId}::uuid
        AND caregiver.status = 'active'
      GROUP BY caregiver.id
      ORDER BY caregiver.first_name, caregiver.last_name, caregiver.id
    `,
  ])

  const staffIds = staff.map(row => row.id)
  const [slotsResult, conflictRows] = await Promise.all([
    q.getCaregiverAvailabilitySlotsByCaregiverIds(staffIds),
    visit.visit_date && visit.scheduled_start_time && visit.scheduled_end_time
      ? sql<{
          id: string
          caregiver_member_id: string
          scheduled_start_time: string | null
          scheduled_end_time: string | null
        }[]>`
          SELECT other.id, other.caregiver_member_id, other.scheduled_start_time,
            other.scheduled_end_time
          FROM public.scheduled_visits other
          WHERE other.agency_id = ${actor.agencyId}::uuid
            AND other.caregiver_member_id IS NOT NULL
            AND other.id <> ${visitId}::uuid
            AND other.status IN ('scheduled', 'in_progress', 'on_hold')
            AND (other.visit_date + COALESCE(other.scheduled_start_time, '00:00'::time))
              < (COALESCE(${visit.scheduled_end_date}::date, ${visit.visit_date}::date)
                 + ${visit.scheduled_end_time}::time)
            AND (${visit.visit_date}::date + ${visit.scheduled_start_time}::time)
              < (COALESCE(other.scheduled_end_date, other.visit_date)
                 + COALESCE(other.scheduled_end_time, '23:59'::time))
        `
      : Promise.resolve([]),
  ])

  if (slotsResult.error) throw new Error('Unable to load caregiver availability.')
  const requiredSkills = Array.isArray(requirements.data?.skill_codes)
    ? requirements.data.skill_codes
    : []
  const preferredSkills = Array.isArray(requirements.data?.preferred_skill_codes)
    ? requirements.data.preferred_skill_codes
    : []

  const candidates = computeCaregiverMatches({
    staff,
    slots: (slotsResult.data ?? []).map(slot => ({
      caregiver_member_id: slot.caregiver_member_id,
      is_recurring: slot.is_recurring,
      start_time: slot.start_time,
      end_time: slot.end_time,
      days_of_week: slot.days_of_week,
      repeat_start: slot.repeat_start,
      repeat_end: slot.repeat_end,
      specific_date: slot.specific_date,
    })),
    conflicts: conflictRows.map(conflict => ({
      id: conflict.id,
      caregiver_id: conflict.caregiver_member_id,
      start_time: conflict.scheduled_start_time,
      end_time: conflict.scheduled_end_time,
    })),
    requiredSkills,
    preferredSkills,
    clientZip: patientRow[0]?.zip_code ?? null,
    visitDate: visit.visit_date,
    visitStart: visit.scheduled_start_time,
    visitEnd: visit.scheduled_end_time,
    currentCaregiverId: visit.caregiver_member_id,
    excludeConflictId: visitId,
  })

  return { candidates, requiredSkills, preferredSkills, visit }
}

export async function loadVisitCaregiverCandidates(
  visitId: string
): Promise<VisitCaregiverCandidateResult> {
  return withCareOperationsManager(actor => loadVisitCaregiverCandidatesForActor(actor, visitId))
}
