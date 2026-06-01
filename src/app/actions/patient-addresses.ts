'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import type { PatientAddressInsert, PatientAddressUpdate } from '@/lib/supabase/query/patient-addresses'

function revalidateClientPaths(patientId: string) {
  revalidatePath(`/pages/agency/clients/${patientId}`)
  revalidatePath(`/pages/admin/clients/${patientId}`)
}

export async function addPatientAddressAction(
  patientId: string,
  payload: Omit<PatientAddressInsert, 'agency_id'>
): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Derive agency_id from the patient record (RLS enforces access)
  const { data: patient } = await supabase
    .from('patients')
    .select('agency_id')
    .eq('id', patientId)
    .single()
  if (!patient?.agency_id) return { error: 'Patient not found or not authorized' }

  if (payload.is_primary) {
    await supabase
      .from('patient_addresses')
      .update({ is_primary: false })
      .eq('patient_id', patientId)
  }

  const { data, error } = await q.insertPatientAddress(supabase, { ...payload, agency_id: patient.agency_id })
  if (error) return { error: error.message }

  revalidateClientPaths(patientId)
  return { error: null, id: (data as any)?.id }
}

export async function updatePatientAddressAction(
  id: string,
  patientId: string,
  payload: PatientAddressUpdate
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (payload.is_primary) {
    await supabase
      .from('patient_addresses')
      .update({ is_primary: false })
      .eq('patient_id', patientId)
      .neq('id', id)
  }

  const { error } = await q.updatePatientAddress(supabase, id, payload)
  if (error) return { error: error.message }

  revalidateClientPaths(patientId)
  return { error: null }
}

export async function deletePatientAddressAction(
  id: string,
  patientId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Guard: fetch current addresses to prevent deleting the only one or the primary
  const { data: existing } = await q.getPatientAddresses(supabase, patientId)
  if (!existing || existing.length <= 1) {
    return { error: 'Cannot delete the only address. Add another address first.' }
  }
  const target = existing.find((a) => a.id === id)
  if (target?.is_primary) {
    return { error: 'Cannot delete the primary address. Set another address as primary first.' }
  }

  const { error } = await q.deletePatientAddress(supabase, id)
  if (error) return { error: error.message }

  revalidateClientPaths(patientId)
  return { error: null }
}

export async function setPrimaryPatientAddressAction(
  patientId: string,
  addressId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await q.setPrimaryPatientAddress(supabase, patientId, addressId)
  if (error) return { error: error.message }

  revalidateClientPaths(patientId)
  return { error: null }
}
