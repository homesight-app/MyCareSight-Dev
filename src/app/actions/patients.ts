'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'

function revalidateAgencyPatientDetailPath(patientId: string) {
  revalidatePath('/pages/agency/clients')
  revalidatePath(`/pages/agency/clients/${patientId}`)
}

/**
 * Update patient documents (JSONB) from the server. Use after uploading files to storage from the client.
 * Ensures the update runs with the same session that loaded the page.
 */
export async function updatePatientDocumentsAction(
  patientId: string,
  documents: PatientDocument[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be logged in to update documents' }
  }

  const { data, error } = await q.updatePatientDocuments(supabase, patientId, documents)
  if (error || !data) {
    return { error: error?.message ?? 'Update failed' }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    table_name: 'patients',
    record_id: patientId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { field: 'documents', patient_id: patientId, document_count: documents.length },
  })
  if (auditErr) console.error('[patients/updateDocuments] Audit log failed. patientId=%s err=%s', patientId, auditErr.message)

  revalidateAgencyPatientDetailPath(patientId)
  return { error: null }
}

/** Save required caregiver skills for a patient and invalidate client detail caches. */
export async function upsertPatientCaregiverRequirementsAction(
  patientId: string,
  skillCodes: string[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be logged in to update caregiver requirements' }
  }

  const normalized = Array.from(new Set((skillCodes ?? []).filter((s): s is string => typeof s === 'string' && s.length > 0))).sort(
    (a, b) => a.localeCompare(b)
  )

  const { error } = await q.upsertCaregiverRequirements(supabase, patientId, normalized)
  if (error) return { error: error.message ?? 'Failed to save caregiver requirements' }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    table_name: 'patient_skill_requirements',
    record_id: patientId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { field: 'skill_codes', patient_id: patientId, skill_codes: normalized },
  })
  if (auditErr) console.error('[patients/upsertCaregiverRequirements] Audit log failed. patientId=%s err=%s', patientId, auditErr.message)

  revalidateAgencyPatientDetailPath(patientId)
  return { error: null }
}
