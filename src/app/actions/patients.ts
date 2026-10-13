'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import {
  patientCaregiverSkillsSchema,
  type PatientCaregiverSkillsInput,
} from '@/lib/schemas/patient-caregiver-skills'
import { zodErrorToFieldErrors } from '@/lib/validation'

function revalidateAgencyPatientDetailPath(patientId: string) {
  revalidatePath('/pages/agency/clients')
  revalidatePath(`/pages/agency/clients/${patientId}`)
}

export async function updatePatientDocumentsAction(
  patientId: string,
  documents: PatientDocument[]
): Promise<{ error: string | null }> {
  void patientId
  void documents
  return { error: 'Use the document upload or delete action.' }
}

/** Fetch names for a set of patient IDs — used by client components that display visit schedules. */
export async function getPatientNamesByIdsAction(
  ids: string[]
): Promise<{ id: string; first_name: string | null; last_name: string | null }[]> {
  if (!ids.length) return []
  const session = await getSession()
  if (!session) return []
  return withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, () =>
    sql<{ id: string; first_name: string | null; last_name: string | null }[]>`
      SELECT id, first_name, last_name FROM patients WHERE id = ANY(${ids}::uuid[])
    `
  )
}

/** Fetch all patients for the viewer's agency — used by client components for tag autocomplete. */
export async function getAgencyPatientNamesAction(): Promise<
  { id: string; first_name: string; last_name: string }[]
> {
  const session = await getSession()
  if (!session) return []
  const agencyId = session.profile?.agency_id ?? null
  if (!agencyId) return []
  return withUserContext(session.user.id, session.profile?.role ?? '', agencyId, () =>
    sql<{ id: string; first_name: string; last_name: string }[]>`
      SELECT id, first_name, last_name FROM patients
      WHERE agency_id = ${agencyId}
      ORDER BY last_name ASC
    `
  )
}

export async function upsertPatientCaregiverRequirementsAction(
  input: PatientCaregiverSkillsInput
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'You must be logged in to update caregiver requirements' }

  const parsed = patientCaregiverSkillsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  }
  const { patientId, requiredSkills, preferredSkills } = parsed.data

  try {
    return await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
      const { error } = await q.upsertCaregiverRequirements(patientId, requiredSkills, preferredSkills)
      if (error) return { success: false, error: error.message ?? 'Failed to save caregiver requirements' }

      const { error: auditErr } = await q.insertAuditLog({
        table_name: 'patient_skill_requirements',
        record_id: patientId,
        action: 'UPDATE',
        performed_by_user_id: session.user.id,
        details: {
          fields: ['skill_codes', 'preferred_skill_codes'],
          required_skill_count: requiredSkills.length,
          preferred_skill_count: preferredSkills.length,
        },
      })
      if (auditErr) throw new Error('Caregiver skill audit write failed')

      revalidateAgencyPatientDetailPath(patientId)
      return { success: true }
    })
  } catch (err) {
    console.error('[patients/upsertCaregiverRequirements]', err)
    return { success: false, error: 'Unable to save caregiver requirements.' }
  }
}
