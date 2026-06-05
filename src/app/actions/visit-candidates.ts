'use server'

import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { computeCaregiverMatches } from '@/lib/caregiver-matching'
import type { CaregiverMatchOption } from '@/lib/caregiver-matching'

export type { CaregiverMatchOption }

/** Fetch and rank caregiver candidates for a single visit (called on-demand when the assign modal opens). */
export async function getCaregiverCandidatesForVisitAction(
  visitId: string
): Promise<{ data: CaregiverMatchOption[] | null; error: string | null }> {
  const supabase = await createClient()

  const { data: visit, error: visitErr } = await supabase
    .from('scheduled_visits')
    .select('patient_id, caregiver_member_id, visit_date, scheduled_start_time, scheduled_end_time, agency_id')
    .eq('id', visitId)
    .single()
  if (visitErr || !visit) return { data: null, error: 'Visit not found' }

  const patientId = visit.patient_id as string
  const currentCaregiverId = (visit.caregiver_member_id ?? null) as string | null
  const visitDate = (visit.visit_date ?? null) as string | null
  const visitStart = (visit.scheduled_start_time ?? null) as string | null
  const visitEnd = (visit.scheduled_end_time ?? null) as string | null
  const agencyId = (visit.agency_id ?? null) as string | null

  const [patientRes, reqRes, staffRes] = await Promise.all([
    supabase.from('patients').select('zip_code').eq('id', patientId).single(),
    q.getCaregiverRequirementsByPatientId(supabase, patientId),
    supabase
      .from('caregiver_members')
      .select('id, first_name, last_name, zip_code, skills, role, job_title, phone')
      .order('first_name', { ascending: true }),
  ])

  const allStaff = (staffRes.data ?? []) as Array<{
    id: string
    first_name?: string | null
    last_name?: string | null
    zip_code?: string | null
    skills?: string[] | null
    role?: string | null
    job_title?: string | null
    phone?: string | null
  }>

  const staffIds = allStaff.map((s) => s.id)
  const [slotsRes, conflictsRes] = await Promise.all([
    q.getCaregiverAvailabilitySlotsByCaregiverIds(supabase, staffIds),
    visitDate
      ? supabase
          .from('scheduled_visits')
          .select('id, caregiver_member_id, scheduled_start_time, scheduled_end_time')
          .eq('visit_date', visitDate)
          .not('caregiver_member_id', 'is', null)
          .neq('id', visitId)
          .neq('status', 'cancelled')
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])

  const requiredSkills: string[] = Array.isArray(reqRes.data?.skill_codes) ? reqRes.data.skill_codes : []

  const conflicts = ((conflictsRes.data ?? []) as Array<{
    id: string
    caregiver_member_id?: string | null
    scheduled_start_time?: string | null
    scheduled_end_time?: string | null
  }>).map((c) => ({
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
    clientZip: patientRes.data?.zip_code ?? null,
    visitDate,
    visitStart,
    visitEnd,
    currentCaregiverId,
    excludeConflictId: visitId,
  })

  void agencyId

  return { data: candidates, error: null }
}
