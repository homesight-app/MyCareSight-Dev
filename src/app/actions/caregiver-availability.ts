'use server'

import { revalidatePath } from 'next/cache'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import type { CaregiverAvailabilitySlotInput } from '@/lib/supabase/query'

type SlotPayload = Omit<CaregiverAvailabilitySlotInput, 'caregiver_member_id' | 'agency_id'>

async function resolveMember(caregiverMemberId: string): Promise<{ agency_id: string | null; user_id: string | null } | null> {
  const rows = await sql`SELECT agency_id, user_id FROM caregiver_members WHERE id = ${caregiverMemberId} LIMIT 1`
  return (rows[0] as { agency_id: string | null; user_id: string | null } | undefined) ?? null
}

export async function getMyAvailabilitySlotsAction(caregiverMemberId: string) {
  const session = await getSession()
  if (!session?.user) return { data: null, error: 'Not authenticated' }
  try {
    return await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
      const member = await resolveMember(caregiverMemberId)
      if (!member || member.user_id !== session.user.id) return { data: null, error: 'Forbidden' }
      const result = await q.getCaregiverAvailabilitySlots(caregiverMemberId)
      if (result.error) return { data: null, error: result.error.message }
      const { error: auditError } = await q.insertAuditLog({
        agency_id: member.agency_id,
        table_name: 'caregiver_availability_slots',
        record_id: caregiverMemberId,
        action: 'READ',
        performed_by_user_id: session.user.id,
        details: { operation: 'read_own_availability' },
      })
      if (auditError) return { data: null, error: 'Unable to record availability access' }
      return { data: result.data, error: null }
    })
  } catch {
    return { data: null, error: 'Unable to load availability' }
  }
}

export async function insertAvailabilitySlotAction(
  caregiverMemberId: string,
  payload: SlotPayload
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session?.user) return { error: 'Not authenticated' }

  try {
    return await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
      const member = await resolveMember(caregiverMemberId)
      if (!member) return { error: 'Caregiver record not found' }
      if (member.user_id !== session.user.id) return { error: 'Forbidden' }

      const { data, error } = await q.insertCaregiverAvailabilitySlot({
        ...payload,
        caregiver_member_id: caregiverMemberId,
        agency_id: member.agency_id ?? null,
      })
      if (error) return { error: error.message }

      const { error: auditErr } = await q.insertAuditLog({
        agency_id: member.agency_id ?? null,
        table_name: 'caregiver_availability_slots',
        record_id: data?.id ?? caregiverMemberId,
        action: 'CREATE',
        performed_by_user_id: session.user.id,
        details: { is_recurring: payload.is_recurring },
      })
      if (auditErr) console.error('[caregiver-availability/insert] Audit log failed. memberId=%s err=%s', caregiverMemberId, auditErr.message)

      revalidatePath('/pages/caregiver/calendar')
      return { error: null }
    })
  } catch (err) {
    console.error('[caregiver-availability/insertAvailabilitySlotAction]', err)
    return { error: 'Internal error' }
  }
}

export async function updateAvailabilitySlotAction(
  caregiverMemberId: string,
  slotId: string,
  payload: SlotPayload
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session?.user) return { error: 'Not authenticated' }

  try {
    return await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
      const member = await resolveMember(caregiverMemberId)
      if (!member) return { error: 'Caregiver record not found' }
      if (member.user_id !== session.user.id) return { error: 'Forbidden' }

      const { error } = await q.updateCaregiverAvailabilitySlot(slotId, caregiverMemberId, payload)
      if (error) return { error: error.message }

      const { error: auditErr } = await q.insertAuditLog({
        agency_id: member.agency_id ?? null,
        table_name: 'caregiver_availability_slots',
        record_id: slotId,
        action: 'UPDATE',
        performed_by_user_id: session.user.id,
        details: { is_recurring: payload.is_recurring },
      })
      if (auditErr) console.error('[caregiver-availability/update] Audit log failed. slotId=%s err=%s', slotId, auditErr.message)

      revalidatePath('/pages/caregiver/calendar')
      return { error: null }
    })
  } catch (err) {
    console.error('[caregiver-availability/updateAvailabilitySlotAction]', err)
    return { error: 'Internal error' }
  }
}

export async function deleteAvailabilitySlotAction(
  caregiverMemberId: string,
  slotId: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session?.user) return { error: 'Not authenticated' }

  try {
    return await withUserContext(session.user.id, session.profile.role ?? '', session.profile.agency_id ?? null, async () => {
      const member = await resolveMember(caregiverMemberId)
      if (!member) return { error: 'Caregiver record not found' }
      if (member.user_id !== session.user.id) return { error: 'Forbidden' }

      const { error } = await q.deleteCaregiverAvailabilitySlot(slotId, caregiverMemberId)
      if (error) return { error: error.message }

      const { error: auditErr } = await q.insertAuditLog({
        agency_id: member.agency_id ?? null,
        table_name: 'caregiver_availability_slots',
        record_id: slotId,
        action: 'DELETE',
        performed_by_user_id: session.user.id,
        details: {},
      })
      if (auditErr) console.error('[caregiver-availability/delete] Audit log failed. slotId=%s err=%s', slotId, auditErr.message)

      revalidatePath('/pages/caregiver/calendar')
      return { error: null }
    })
  } catch (err) {
    console.error('[caregiver-availability/deleteAvailabilitySlotAction]', err)
    return { error: 'Internal error' }
  }
}
