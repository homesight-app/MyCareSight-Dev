import sql from '@/db'

export interface CaregiverRequirement {
  id: string
  patient_id: string
  skill_codes: string[]
  created_at: string
  updated_at: string
}

async function getPatientAgencyId(patientId: string): Promise<string | null> {
  const rows = await sql`SELECT agency_id FROM patients WHERE id = ${patientId} LIMIT 1`
  return (rows[0]?.agency_id as string | null | undefined) ?? null
}

/** Get skill requirements for a patient (at most one row). */
export async function getCaregiverRequirementsByPatientId(
  patientId: string
): Promise<{ data: CaregiverRequirement | null; error: Error | null }> {
  try {
    const rows = await sql`
      SELECT * FROM patient_skill_requirements
      WHERE patient_id = ${patientId}
      LIMIT 1
    `
    return { data: (rows[0] ?? null) as CaregiverRequirement | null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Batch-load skill requirements for many patients. */
export async function getCaregiverRequirementsByPatientIds(
  patientIds: string[]
): Promise<{ data: CaregiverRequirement[] | null; error: Error | null }> {
  if (patientIds.length === 0) return { data: [] as unknown as CaregiverRequirement[], error: null }
  try {
    const rows = await sql`
      SELECT * FROM patient_skill_requirements
      WHERE patient_id = ANY(${patientIds})
    `
    return { data: rows as unknown as CaregiverRequirement[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Upsert skill requirements for a patient. */
export async function upsertCaregiverRequirements(
  patientId: string,
  skillCodes: string[]
): Promise<{ data: null; error: Error | { message: string } | null }> {
  try {
    const agencyId = await getPatientAgencyId(patientId)
    if (!agencyId) {
      return {
        data: null,
        error: { message: 'Patient has no agency_id; cannot save skill requirements.' },
      }
    }
    await sql`
      INSERT INTO patient_skill_requirements (patient_id, agency_id, skill_codes)
      VALUES (${patientId}, ${agencyId}, ${skillCodes as unknown as string})
      ON CONFLICT (patient_id)
      DO UPDATE SET skill_codes = EXCLUDED.skill_codes, updated_at = NOW()
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
