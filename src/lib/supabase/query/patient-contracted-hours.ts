import sql from '@/db'

/** UI shape for weekly contracted hours (backed by patient_service_contracts.contract_type = weekly_hours). */
export interface PatientContractedHoursRow {
  id: string
  patient_id: string
  total_hours: number
  effective_date: string
  end_date: string | null
  note: string | null
  created_at: string
  updated_at: string
}

function mapServiceContractToUi(row: {
  id: string
  patient_id: string
  weekly_hours_limit: number | string | null
  effective_date: string
  end_date: string | null
  note: string | null
  created_at: string
  updated_at: string
}): PatientContractedHoursRow {
  return {
    id: row.id,
    patient_id: row.patient_id,
    total_hours: Number(row.weekly_hours_limit ?? 0),
    effective_date: row.effective_date,
    end_date: row.end_date,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const pgError = (err: unknown) => ({
  message: err instanceof Error ? err.message : String(err),
  code: '',
  details: '',
  hint: '',
  name: 'Error',
})

async function getPatientAgencyId(patientId: string): Promise<string | null> {
  const rows = await sql`SELECT agency_id FROM patients WHERE id = ${patientId} LIMIT 1`
  return (rows[0]?.agency_id as string) ?? null
}

/** Get all weekly-hours contract limits for a patient, ordered by effective_date desc. */
export async function getPatientContractedHoursByPatientId(patientId: string) {
  try {
    const rows = await sql`
      SELECT *
      FROM patient_service_contracts
      WHERE patient_id = ${patientId}
        AND contract_type = 'weekly_hours'
      ORDER BY effective_date DESC
    `
    return {
      data: rows.map((r) => mapServiceContractToUi(r as Parameters<typeof mapServiceContractToUi>[0])),
      error: null,
    }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Insert a weekly-hours limit (patient_service_contracts). Returns UI-shaped row. */
export async function insertPatientContractedHours(
  data: {
    patient_id: string
    total_hours: number
    effective_date: string
    end_date?: string | null
    note?: string | null
  }
) {
  try {
    const agencyId = await getPatientAgencyId(data.patient_id)
    if (!agencyId) {
      return {
        data: null,
        error: { message: 'Patient has no agency_id; cannot create service contract.', details: '', hint: '', code: '' },
      }
    }

    const rpcRows = await sql`
      SELECT append_patient_service_contract(
        ${agencyId},
        ${data.patient_id},
        ${null},
        ${'weekly_hours'},
        ${'non_skilled'},
        ${null},
        ${null},
        ${'hour'},
        ${data.total_hours},
        ${data.effective_date},
        ${data.end_date ?? null},
        ${data.note ?? null}
      ) AS inserted_id
    `
    const insertedId = rpcRows[0]?.inserted_id as string | null
    if (!insertedId) return { data: null, error: { message: 'Insert did not return row id', details: '', hint: '', code: '' } }

    const rowRes = await sql`SELECT * FROM patient_service_contracts WHERE id = ${insertedId} LIMIT 1`
    if (!rowRes[0]) return { data: null, error: { message: 'Could not fetch inserted row', details: '', hint: '', code: '' } }
    return {
      data: mapServiceContractToUi(rowRes[0] as Parameters<typeof mapServiceContractToUi>[0]),
      error: null,
    }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Delete a weekly-hours contract row by id. */
export async function deletePatientContractedHours(id: string) {
  try {
    await sql`
      DELETE FROM patient_service_contracts
      WHERE id = ${id}
        AND contract_type = 'weekly_hours'
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

/** Active weekly-hours row covering date (effective_date <= date and open-ended or end_date >= date). */
export async function getActiveContractedHoursForDate(
  patientId: string,
  date: string
): Promise<PatientContractedHoursRow | null> {
  try {
    const rows = await sql`
      SELECT *
      FROM patient_service_contracts
      WHERE patient_id = ${patientId}
        AND contract_type = 'weekly_hours'
        AND effective_date <= ${date}
        AND (end_date IS NULL OR end_date >= ${date})
      ORDER BY effective_date DESC
      LIMIT 1
    `
    return rows[0] ? mapServiceContractToUi(rows[0] as Parameters<typeof mapServiceContractToUi>[0]) : null
  } catch {
    return null
  }
}
