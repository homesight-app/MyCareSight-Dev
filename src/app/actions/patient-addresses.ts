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
  if (error) return { error: 'Failed to save address. Please try again.' }

  // HIPAA § 164.312(b): addresses are PHI — log every write
  const { error: auditAddErr } = await supabase.from('audit_log').insert({
    agency_id: patient.agency_id,
    patient_id: patientId,
    table_name: 'patient_addresses',
    record_id: data?.id ?? null,
    action: 'INSERT',
    performed_by_user_id: user.id,
    details: { patient_id: patientId, is_primary: payload.is_primary ?? false },
  })
  if (auditAddErr) console.error('[patient-addresses/add] Audit log INSERT failed. patientId=%s err=%s', patientId, auditAddErr.message)

  revalidateClientPaths(patientId)
  return { error: null, id: data?.id }
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
  if (error) return { error: 'Failed to update address. Please try again.' }

  const { error: auditUpdateErr } = await supabase.from('audit_log').insert({
    table_name: 'patient_addresses',
    record_id: id,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { patient_id: patientId, ...payload },
  })
  if (auditUpdateErr) console.error('[patient-addresses/update] Audit log UPDATE failed. addressId=%s err=%s', id, auditUpdateErr.message)

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

  const { data: existing } = await q.getPatientAddresses(supabase, patientId)
  if (!existing || existing.length <= 1) {
    return { error: 'Cannot delete the only address. Add another address first.' }
  }
  const target = existing.find((a) => a.id === id)
  if (target?.is_primary) {
    return { error: 'Cannot delete the primary address. Set another address as primary first.' }
  }

  const { error } = await q.deletePatientAddress(supabase, id)
  if (error) return { error: 'Failed to delete address. Please try again.' }

  // Log deletion with patient_id for HIPAA audit trail
  const { error: auditDeleteErr } = await supabase.from('audit_log').insert({
    table_name: 'patient_addresses',
    record_id: id,
    action: 'DELETE',
    performed_by_user_id: user.id,
    details: { patient_id: patientId },
  })
  if (auditDeleteErr) console.error('[patient-addresses/delete] Audit log DELETE failed. addressId=%s err=%s', id, auditDeleteErr.message)

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
  if (error) return { error: 'Failed to update primary address. Please try again.' }

  const { error: auditPrimaryErr } = await supabase.from('audit_log').insert({
    table_name: 'patient_addresses',
    record_id: addressId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { patient_id: patientId, is_primary: true },
  })
  if (auditPrimaryErr) console.error('[patient-addresses/setPrimary] Audit log UPDATE failed. addressId=%s err=%s', addressId, auditPrimaryErr.message)

  revalidateClientPaths(patientId)
  return { error: null }
}
