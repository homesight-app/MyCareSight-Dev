import type { Supabase } from '../types'

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

async function getPatientAgencyId(supabase: Supabase, patientId: string): Promise<string | null> {
  const { data } = await supabase.from('patients').select('agency_id').eq('id', patientId).maybeSingle()
  return data?.agency_id ?? null
}

export async function getPatientServiceContractsByPatientId(supabase: Supabase, patientId: string) {
  await supabase.rpc('reconcile_patient_service_contract_statuses', {
    p_patient_id: patientId,
  })
  return supabase
    .from('patient_service_contracts')
    .select('*')
    .eq('patient_id', patientId)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
}

export async function insertPatientServiceContract(
  supabase: Supabase,
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
  const agencyId = await getPatientAgencyId(supabase, data.patient_id)
  if (!agencyId) return { data: null, error: { message: 'Patient has no agency_id' } }
  const { data: insertedId, error: insertErr } = await supabase.rpc('append_patient_service_contract', {
    p_agency_id: agencyId,
    p_patient_id: data.patient_id,
    p_contract_name: data.contract_name ?? null,
    p_contract_type: data.contract_type,
    p_service_type: data.service_type,
    p_billing_code_id: data.billing_code_id ?? null,
    p_bill_rate: data.bill_rate ?? null,
    p_bill_unit_type: data.bill_unit_type,
    p_weekly_hours_limit: data.weekly_hours_limit ?? null,
    p_effective_date: data.effective_date,
    p_end_date: data.end_date ?? null,
    p_note: data.note ?? null,
  })
  if (insertErr) return { data: null, error: insertErr }
  if (!insertedId) return { data: null, error: { message: 'Insert did not return row id' } }

  // Set mileage billing fields via direct UPDATE (not in RPC signature)
  if (data.bill_mileage !== undefined || data.mileage_bill_rate_per_mile !== undefined) {
    await supabase
      .from('patient_service_contracts')
      .update({
        bill_mileage: data.bill_mileage ?? false,
        mileage_bill_rate_per_mile: data.mileage_bill_rate_per_mile ?? null,
      })
      .eq('id', insertedId)
  }

  return supabase.from('patient_service_contracts').select('*').eq('id', insertedId).single()
}

export async function updatePatientServiceContractStatus(
  supabase: Supabase,
  id: string,
  status: 'active' | 'inactive'
) {
  return supabase.rpc('set_patient_service_contract_status', {
    p_contract_id: id,
    p_status: status,
  })
}

export async function updatePatientServiceContractDetails(
  supabase: Supabase,
  id: string,
  data: {
    contract_name?: string | null
    end_date?: string | null
    note?: string | null
    bill_mileage?: boolean
    mileage_bill_rate_per_mile?: number | null
  }
) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (data.contract_name !== undefined) patch.contract_name = data.contract_name
  if (data.end_date !== undefined) patch.end_date = data.end_date
  if (data.note !== undefined) patch.note = data.note
  if (data.bill_mileage !== undefined) patch.bill_mileage = data.bill_mileage
  if (data.mileage_bill_rate_per_mile !== undefined) patch.mileage_bill_rate_per_mile = data.mileage_bill_rate_per_mile
  return supabase.from('patient_service_contracts').update(patch).eq('id', id).select('*').single()
}

export async function deletePatientServiceContract(supabase: Supabase, id: string) {
  const rpcRes = await supabase.rpc('delete_patient_service_contract', {
    p_contract_id: id,
  })
  if (!rpcRes.error) return { data: rpcRes.data, error: null }
  const msg = String(rpcRes.error.message ?? '').toLowerCase()
  // Backward-compat fallback when migration is not applied yet.
  if (msg.includes('function') && msg.includes('delete_patient_service_contract') && msg.includes('does not exist')) {
    return supabase.from('patient_service_contracts').delete().eq('id', id)
  }
  return { data: null, error: rpcRes.error }
}
