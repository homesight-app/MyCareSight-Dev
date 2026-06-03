import type { Supabase } from '../types'

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

export async function getPatientAddresses(supabase: Supabase, patientId: string) {
  return supabase
    .from('patient_addresses')
    .select('id, patient_id, agency_id, label, street_address, city, state, zip_code, is_primary, created_at, updated_at')
    .eq('patient_id', patientId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
}

export async function insertPatientAddress(supabase: Supabase, payload: PatientAddressInsert) {
  return supabase
    .from('patient_addresses')
    .insert(payload)
    .select()
    .single()
}

export async function updatePatientAddress(supabase: Supabase, id: string, payload: PatientAddressUpdate) {
  return supabase
    .from('patient_addresses')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
}

export async function deletePatientAddress(supabase: Supabase, id: string) {
  return supabase
    .from('patient_addresses')
    .delete()
    .eq('id', id)
}

/** Promotes addressId to primary and demotes all other addresses for the same patient. */
export async function setPrimaryPatientAddress(supabase: Supabase, patientId: string, addressId: string) {
  // Clear existing primary first to avoid unique index conflict
  await supabase
    .from('patient_addresses')
    .update({ is_primary: false })
    .eq('patient_id', patientId)
    .neq('id', addressId)

  return supabase
    .from('patient_addresses')
    .update({ is_primary: true })
    .eq('id', addressId)
    .select()
    .single()
}
