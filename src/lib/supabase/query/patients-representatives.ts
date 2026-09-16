import sql from '@/db'

export interface PatientRepresentative {
  id: string
  patient_id: string
  name: string | null
  relationship: string | null
  phone_number: string | null
  email_address: string | null
  display_order: number
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

/** Get representatives for a patient, ordered by display_order. */
export async function getRepresentativesByPatientId(patientId: string) {
  try {
    const rows = await sql`
      SELECT *
      FROM patients_representatives
      WHERE patient_id = ${patientId}
      ORDER BY display_order ASC
    `
    return { data: rows as unknown as PatientRepresentative[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Insert a representative and return the inserted row. */
export async function insertRepresentative(
  data: {
    patient_id: string
    name: string | null
    relationship?: string | null
    phone_number?: string | null
    email_address?: string | null
    display_order: number
  }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    const rows = await sql`
      INSERT INTO patients_representatives ${sql(data as Record<string, unknown>, ...keys)}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Insert did not return a row')
    return { data: rows[0] as PatientRepresentative, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Update a representative by id. */
export async function updateRepresentative(
  id: string,
  data: {
    name?: string | null
    relationship?: string | null
    phone_number?: string | null
    email_address?: string | null
    display_order?: number
  }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    await sql`
      UPDATE patients_representatives
      SET ${sql(data as Record<string, unknown>, ...keys)}
      WHERE id = ${id}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Delete a representative by id. */
export async function deleteRepresentative(id: string) {
  try {
    await sql`DELETE FROM patients_representatives WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}
