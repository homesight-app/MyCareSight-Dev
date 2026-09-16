'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import sql from '@/db'
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
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null

  return withUserContext(session.user.id, role, agencyId, async () => {
    const [patient] = await sql<{ agency_id: string }[]>`
      SELECT agency_id FROM patients WHERE id = ${patientId} LIMIT 1
    `
    if (!patient?.agency_id) return { error: 'Patient not found or not authorized' }

    if (payload.is_primary) {
      await sql`UPDATE patient_addresses SET is_primary = false WHERE patient_id = ${patientId}`
    }

    const { data, error } = await q.insertPatientAddress({ ...payload, agency_id: patient.agency_id })
    if (error) return { error: 'Failed to save address. Please try again.' }

    // HIPAA § 164.312(b): addresses are PHI — log every write
    const { error: auditAddErr } = await q.insertAuditLog({
      agency_id: patient.agency_id,
      table_name: 'patient_addresses',
      record_id: data?.id ?? null,
      action: 'INSERT',
      performed_by_user_id: session.user.id,
      details: { patient_id: patientId, is_primary: payload.is_primary ?? false },
    })
    if (auditAddErr) console.error('[patient-addresses/add] Audit log INSERT failed. patientId=%s err=%s', patientId, auditAddErr.message)

    revalidateClientPaths(patientId)
    return { error: null, id: data?.id }
  })
}

export async function updatePatientAddressAction(
  id: string,
  patientId: string,
  payload: PatientAddressUpdate
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null

  return withUserContext(session.user.id, role, agencyId, async () => {
    // Verify address belongs to this patient (prevents cross-patient address edits)
    const [addrRow] = await sql<{ patient_id: string; agency_id: string }[]>`
      SELECT pa.patient_id, p.agency_id
      FROM patient_addresses pa
      JOIN patients p ON p.id = pa.patient_id
      WHERE pa.id = ${id}
      LIMIT 1
    `
    if (!addrRow || addrRow.patient_id !== patientId) {
      return { error: 'Address not found or not authorized' }
    }

    if (payload.is_primary) {
      await sql`UPDATE patient_addresses SET is_primary = false WHERE patient_id = ${patientId} AND id != ${id}`
    }

    const { error } = await q.updatePatientAddress(id, payload)
    if (error) return { error: 'Failed to update address. Please try again.' }

    // Audit: log field-level metadata only — never spread payload (PHI)
    const { error: auditUpdateErr } = await q.insertAuditLog({
      table_name: 'patient_addresses',
      record_id: id,
      action: 'UPDATE',
      performed_by_user_id: session.user.id,
      details: { patient_id: patientId, is_primary: payload.is_primary ?? false },
    })
    if (auditUpdateErr) console.error('[patient-addresses/update] Audit log UPDATE failed. addressId=%s err=%s', id, auditUpdateErr.message)

    revalidateClientPaths(patientId)
    return { error: null }
  })
}

export async function deletePatientAddressAction(
  id: string,
  patientId: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null

  return withUserContext(session.user.id, role, agencyId, async () => {
    const [patient] = await sql<{ agency_id: string }[]>`
      SELECT agency_id FROM patients WHERE id = ${patientId} LIMIT 1
    `
    if (!patient?.agency_id) return { error: 'Patient not found or not authorized' }

    const { data: existing } = await q.getPatientAddresses(patientId)
    if (!existing || existing.length <= 1) {
      return { error: 'Cannot delete the only address. Add another address first.' }
    }
    const target = existing.find((a) => a.id === id)
    if (!target) return { error: 'Address not found or not authorized' }
    if (target.is_primary) {
      return { error: 'Cannot delete the primary address. Set another address as primary first.' }
    }

    const { error } = await q.deletePatientAddress(id)
    if (error) return { error: 'Failed to delete address. Please try again.' }

    // Log deletion with patient_id for HIPAA audit trail
    const { error: auditDeleteErr } = await q.insertAuditLog({
      table_name: 'patient_addresses',
      record_id: id,
      action: 'DELETE',
      performed_by_user_id: session.user.id,
      details: { patient_id: patientId },
    })
    if (auditDeleteErr) console.error('[patient-addresses/delete] Audit log DELETE failed. addressId=%s err=%s', id, auditDeleteErr.message)

    revalidateClientPaths(patientId)
    return { error: null }
  })
}

export async function setPrimaryPatientAddressAction(
  patientId: string,
  addressId: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  const role = session.profile?.role ?? ''
  const agencyId = session.profile?.agency_id ?? null

  return withUserContext(session.user.id, role, agencyId, async () => {
    const [addrRow] = await sql<{ patient_id: string }[]>`
      SELECT pa.patient_id
      FROM patient_addresses pa
      JOIN patients p ON p.id = pa.patient_id
      WHERE pa.id = ${addressId}
      LIMIT 1
    `
    if (!addrRow || addrRow.patient_id !== patientId) {
      return { error: 'Address not found or not authorized' }
    }

    const { error } = await q.setPrimaryPatientAddress(patientId, addressId)
    if (error) return { error: 'Failed to update primary address. Please try again.' }

    const { error: auditPrimaryErr } = await q.insertAuditLog({
      table_name: 'patient_addresses',
      record_id: addressId,
      action: 'UPDATE',
      performed_by_user_id: session.user.id,
      details: { patient_id: patientId, is_primary: true },
    })
    if (auditPrimaryErr) console.error('[patient-addresses/setPrimary] Audit log UPDATE failed. addressId=%s err=%s', addressId, auditPrimaryErr.message)

    revalidateClientPaths(patientId)
    return { error: null }
  })
}
