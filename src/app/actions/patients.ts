'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'

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
  patientId: string,
  skillCodes: string[]
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'You must be logged in to update caregiver requirements' }

  try {
    return await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
      const normalized = Array.from(new Set((skillCodes ?? []).filter((s): s is string => typeof s === 'string' && s.length > 0))).sort(
        (a, b) => a.localeCompare(b)
      )

      const { error } = await q.upsertCaregiverRequirements(patientId, normalized)
      if (error) return { error: error.message ?? 'Failed to save caregiver requirements' }

      const { error: auditErr } = await q.insertAuditLog({
        table_name: 'patient_skill_requirements',
        record_id: patientId,
        action: 'UPDATE',
        performed_by_user_id: session.user.id,
        details: { field: 'skill_codes', skill_count: normalized.length },
      })
      if (auditErr) console.error('[patients/upsertCaregiverRequirements] Audit log failed. patientId=%s err=%s', patientId, auditErr.message)

      revalidateAgencyPatientDetailPath(patientId)
      return { error: null }
    })
  } catch (err) {
    console.error('[patients/upsertCaregiverRequirements]', err)
    return { error: 'Internal error' }
  }
}
