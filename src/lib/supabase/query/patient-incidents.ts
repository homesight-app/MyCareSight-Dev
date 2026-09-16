import sql from '@/db'

export interface PatientIncident {
  id: string
  patient_id: string
  incident_date: string
  reporting_date: string
  primary_contact_person: string
  description: string
  file_path: string | null
  file_name: string | null
  created_at: string
  updated_at: string
}

const pgError = (err: unknown) => ({
  message: err instanceof Error ? err.message : String(err),
  code: '',
  details: '',
  hint: '',
  name: 'Error',
})

/** Get incidents for a patient, ordered by reporting_date descending. */
export async function getIncidentsByPatientId(patientId: string) {
  try {
    const rows = await sql`
      SELECT *
      FROM patient_incidents
      WHERE patient_id = ${patientId}
      ORDER BY reporting_date DESC
    `
    return { data: rows as unknown as PatientIncident[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Insert an incident (file_path and file_name can be set later via update). */
export async function insertIncident(
  data: {
    patient_id: string
    incident_date: string
    reporting_date: string
    primary_contact_person: string
    description: string
    file_path?: string | null
    file_name?: string | null
  }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    const rows = await sql`
      INSERT INTO patient_incidents ${sql(data as Record<string, unknown>, ...keys)}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Insert did not return a row')
    return { data: rows[0] as PatientIncident, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Update an incident (e.g. to set file_path and file_name after upload). */
export async function updateIncident(
  id: string,
  data: { file_path?: string | null; file_name?: string | null }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    const rows = await sql`
      UPDATE patient_incidents
      SET ${sql(data as Record<string, unknown>, ...keys)}
      WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Update did not return a row')
    return { data: rows[0] as PatientIncident, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Delete an incident by id. */
export async function deleteIncident(id: string) {
  try {
    await sql`DELETE FROM patient_incidents WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}
