'use server'

import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { overallScorePercent, proximityPercentFromMiles } from '@/lib/visit-assignment-scoring'
import type { ReassignCandidateDTO } from '@/lib/visit-all-visits-dashboard'
import zipcodes from 'zipcodes'

function normalizeZip(zip: unknown): string | null {
  if (zip == null) return null
  const digits = String(zip).trim().replace(/\D/g, '').slice(0, 5)
  return digits.length === 5 ? digits : null
}

function skillMatch(required: string[], caregiver: string[]): { percent: number; matched: string[] } {
  if (required.length === 0) return { percent: 100, matched: [] }
  const matched = required.filter((sk) => caregiver.includes(sk))
  return { percent: Math.round((matched.length / required.length) * 100), matched }
}

/** Fetch and rank caregiver candidates for a single visit (called on-demand when the assign modal opens). */
export async function getCaregiverCandidatesForVisitAction(
  visitId: string
): Promise<{ data: ReassignCandidateDTO[] | null; error: string | null }> {
  const supabase = await createClient()

  const { data: visit, error: visitErr } = await supabase
    .from('scheduled_visits')
    .select('patient_id, caregiver_member_id')
    .eq('id', visitId)
    .single()
  if (visitErr || !visit) return { data: null, error: 'Visit not found' }

  const patientId = visit.patient_id as string
  const currentCaregiverId = (visit.caregiver_member_id ?? null) as string | null

  const [patientRes, reqRes, staffRes] = await Promise.all([
    supabase.from('patients').select('zip_code').eq('id', patientId).single(),
    q.getCaregiverRequirementsByPatientId(supabase, patientId),
    supabase
      .from('caregiver_members')
      .select('id, first_name, last_name, zip_code, skills, role, job_title')
      .order('first_name', { ascending: true }),
  ])

  const clientZip = normalizeZip(patientRes.data?.zip_code)
  const requiredSkills: string[] = Array.isArray(reqRes.data?.skill_codes) ? reqRes.data.skill_codes : []

  type StaffCandidate = {
    id: string
    first_name?: string | null
    last_name?: string | null
    zip_code?: string | null
    skills?: string[] | null
    role?: string | null
    job_title?: string | null
  }
  const allStaff = (staffRes.data ?? []) as StaffCandidate[]

  const candidates: ReassignCandidateDTO[] = allStaff
    .map((staff) => {
      const staffZip = normalizeZip(staff.zip_code)
      let distanceMiles = Number.POSITIVE_INFINITY
      if (clientZip && staffZip) {
        const d = zipcodes.distance(clientZip, staffZip)
        if (d != null && Number.isFinite(d)) distanceMiles = d
      }
      const proximity = proximityPercentFromMiles(distanceMiles)
      if (proximity === null) return null

      const caregiverSkills = Array.isArray(staff.skills) ? staff.skills : []
      const { percent: skillPct, matched } = skillMatch(requiredSkills, caregiverSkills)
      return {
        id: staff.id,
        caregiverName: [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'Caregiver',
        caregiverTitle: staff.job_title?.trim() || (staff.role ? String(staff.role).trim() : '') || 'Caregiver',
        distanceMiles,
        skillMatchPercent: skillPct,
        proximityPercent: proximity,
        overallPercent: overallScorePercent(skillPct, proximity),
        matchedSkills: matched,
        isCurrent: currentCaregiverId === staff.id,
      }
    })
    .filter((v): v is ReassignCandidateDTO => v !== null)
    .sort((a, b) => b.overallPercent - a.overallPercent)

  return { data: candidates, error: null }
}
