import sql from '@/db'

export type PatientAddress = {
  id: string
  patient_id: string
  agency_id: string
  label: string
  street_address: string
  city: string
  state: string
  zip_code: string
  is_primary: boolean
  created_at: string
  updated_at: string
}

export type PatientAddressInsert = Omit<PatientAddress, 'id' | 'created_at' | 'updated_at'>
export type PatientAddressUpdate = Partial<Omit<PatientAddress, 'id' | 'patient_id' | 'agency_id' | 'created_at' | 'updated_at'>>

const pgError = (err: unknown) => ({
  message: err instanceof Error ? err.message : String(err),
  code: '',
  details: '',
  hint: '',
  name: 'Error',
})

export async function getPatientAddresses(patientId: string) {
  try {
    const rows = await sql`
      SELECT id, patient_id, agency_id, label, street_address, city, state, zip_code, is_primary, created_at, updated_at
      FROM patient_addresses
      WHERE patient_id = ${patientId}
      ORDER BY is_primary DESC, created_at ASC
    `
    return { data: rows as unknown as PatientAddress[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export async function insertPatientAddress(payload: PatientAddressInsert) {
  try {
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    const rows = await sql`
      INSERT INTO patient_addresses ${sql(payload as Record<string, unknown>, ...keys)}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Insert did not return a row')
    return { data: rows[0] as PatientAddress, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export async function updatePatientAddress(id: string, payload: PatientAddressUpdate) {
  try {
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    const rows = await sql`
      UPDATE patient_addresses
      SET ${sql(payload as Record<string, unknown>, ...keys)}
      WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Update did not return a row')
    return { data: rows[0] as PatientAddress, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export async function deletePatientAddress(id: string) {
  try {
    await sql`DELETE FROM patient_addresses WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Promotes addressId to primary and demotes all other addresses for the same patient. */
export async function setPrimaryPatientAddress(patientId: string, addressId: string) {
  try {
    // Clear existing primary first to avoid unique index conflict
    await sql`
      UPDATE patient_addresses
      SET is_primary = false
      WHERE patient_id = ${patientId}
        AND id != ${addressId}
    `
    const rows = await sql`
      UPDATE patient_addresses
      SET is_primary = true
      WHERE id = ${addressId}
        AND patient_id = ${patientId}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Update did not return a row')
    return { data: rows[0] as PatientAddress, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}
