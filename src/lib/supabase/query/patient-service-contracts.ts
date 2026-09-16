import sql from '@/db'

export type PatientServiceContractRow = {
  id: string
  patient_id: string
  contract_name: string | null
  contract_type: string
  service_type: 'non_skilled' | 'skilled'
  billing_code_id: string | null
  bill_rate: number | null
  bill_unit_type: 'hour' | 'visit' | '15_min_unit'
  weekly_hours_limit: number | null
  effective_date: string
  end_date: string | null
  status: string
  note: string | null
  created_at: string
  updated_at?: string
  bill_mileage?: boolean
  mileage_bill_rate_per_mile?: number | null
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

export async function getPatientServiceContractsByPatientId(patientId: string) {
  try {
    await sql`SELECT reconcile_patient_service_contract_statuses(${patientId})`
    const rows = await sql`
      SELECT *
      FROM patient_service_contracts
      WHERE patient_id = ${patientId}
      ORDER BY effective_date DESC, created_at DESC
    `
    return { data: rows as unknown as PatientServiceContractRow[], error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export async function insertPatientServiceContract(
  data: {
    patient_id: string
    contract_name?: string | null
    contract_type: string
    service_type: 'non_skilled' | 'skilled'
    billing_code_id?: string | null
    bill_rate?: number | null
    bill_unit_type: 'hour' | 'visit' | '15_min_unit'
    weekly_hours_limit?: number | null
    effective_date: string
    end_date?: string | null
    note?: string | null
    bill_mileage?: boolean
    mileage_bill_rate_per_mile?: number | null
  }
) {
  try {
    const agencyId = await getPatientAgencyId(data.patient_id)
    if (!agencyId) return { data: null, error: { message: 'Patient has no agency_id' } }

    const rpcRows = await sql`
      SELECT append_patient_service_contract(
        ${agencyId},
        ${data.patient_id},
        ${data.contract_name ?? null},
        ${data.contract_type},
        ${data.service_type},
        ${data.billing_code_id ?? null},
        ${data.bill_rate ?? null},
        ${data.bill_unit_type},
        ${data.weekly_hours_limit ?? null},
        ${data.effective_date},
        ${data.end_date ?? null},
        ${data.note ?? null}
      ) AS inserted_id
    `
    const insertedId = rpcRows[0]?.inserted_id as string | null
    if (!insertedId) return { data: null, error: { message: 'Insert did not return row id' } }

    // Set mileage billing fields via direct UPDATE (not in RPC signature)
    if (data.bill_mileage !== undefined || data.mileage_bill_rate_per_mile !== undefined) {
      await sql`
        UPDATE patient_service_contracts
        SET bill_mileage = ${data.bill_mileage ?? false},
            mileage_bill_rate_per_mile = ${data.mileage_bill_rate_per_mile ?? null}
        WHERE id = ${insertedId}
      `
    }

    const rows = await sql`SELECT * FROM patient_service_contracts WHERE id = ${insertedId} LIMIT 1`
    if (!rows[0]) throw new Error('Could not fetch inserted contract')
    return { data: rows[0] as PatientServiceContractRow, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export async function updatePatientServiceContractStatus(
  id: string,
  status: 'active' | 'inactive'
) {
  try {
    await sql`SELECT set_patient_service_contract_status(${id}, ${status})`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export async function updatePatientServiceContractDetails(
  id: string,
  data: {
    contract_name?: string | null
    end_date?: string | null
    note?: string | null
    bill_mileage?: boolean
    mileage_bill_rate_per_mile?: number | null
  }
) {
  try {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (data.contract_name !== undefined) patch.contract_name = data.contract_name
    if (data.end_date !== undefined) patch.end_date = data.end_date
    if (data.note !== undefined) patch.note = data.note
    if (data.bill_mileage !== undefined) patch.bill_mileage = data.bill_mileage
    if (data.mileage_bill_rate_per_mile !== undefined) patch.mileage_bill_rate_per_mile = data.mileage_bill_rate_per_mile

    const keys = Object.keys(patch)
    const rows = await sql`
      UPDATE patient_service_contracts
      SET ${sql(patch, ...keys)}
      WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Update did not return a row')
    return { data: rows[0] as PatientServiceContractRow, error: null }
  } catch (err) {
    return { data: null, error: pgError(err) }
  }
}

export async function deletePatientServiceContract(id: string) {
  try {
    const rpcRows = await sql`SELECT delete_patient_service_contract(${id}) AS result`
    return { data: rpcRows[0]?.result ?? null, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
    // Backward-compat fallback when migration is not applied yet.
    if (msg.includes('function') && msg.includes('delete_patient_service_contract') && msg.includes('does not exist')) {
      try {
        await sql`DELETE FROM patient_service_contracts WHERE id = ${id}`
        return { data: null, error: null }
      } catch (fallbackErr) {
        return { data: null, error: pgError(fallbackErr) }
      }
    }
    return { data: null, error: pgError(err) }
  }
}
