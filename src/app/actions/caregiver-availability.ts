'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import type { CaregiverAvailabilitySlotInput } from '@/lib/supabase/query'
import type { Supabase } from '@/lib/supabase/types'

type SlotPayload = Omit<CaregiverAvailabilitySlotInput, 'caregiver_member_id' | 'agency_id'>

async function resolveMember(supabase: Supabase, caregiverMemberId: string) {
  const { data } = await supabase
    .from('caregiver_members')
    .select('agency_id, user_id')
    .eq('id', caregiverMemberId)
    .maybeSingle()
  return data
}

export async function insertAvailabilitySlotAction(
  caregiverMemberId: string,
  payload: SlotPayload
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const member = await resolveMember(supabase, caregiverMemberId)
  if (!member) return { error: 'Caregiver record not found' }
  if (member.user_id !== user.id) return { error: 'Forbidden' }

  const { data, error } = await q.insertCaregiverAvailabilitySlot(supabase, {
    ...payload,
    caregiver_member_id: caregiverMemberId,
    agency_id: member.agency_id ?? null,
  })
  if (error) return { error: error.message }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: member.agency_id ?? null,
    table_name: 'caregiver_availability_slots',
    record_id: data?.id ?? caregiverMemberId,
    action: 'CREATE',
    performed_by_user_id: user.id,
    details: { is_recurring: payload.is_recurring, specific_date: payload.specific_date ?? null },
  })
  if (auditErr) console.error('[caregiver-availability/insert] Audit log failed. memberId=%s err=%s', caregiverMemberId, auditErr.message)

  revalidatePath('/pages/caregiver/calendar')
  return { error: null }
}

export async function updateAvailabilitySlotAction(
  caregiverMemberId: string,
  slotId: string,
  payload: SlotPayload
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const member = await resolveMember(supabase, caregiverMemberId)
  if (!member) return { error: 'Caregiver record not found' }
  if (member.user_id !== user.id) return { error: 'Forbidden' }

  const { error } = await q.updateCaregiverAvailabilitySlot(supabase, slotId, caregiverMemberId, payload)
  if (error) return { error: error.message }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: member.agency_id ?? null,
    table_name: 'caregiver_availability_slots',
    record_id: slotId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { is_recurring: payload.is_recurring, specific_date: payload.specific_date ?? null },
  })
  if (auditErr) console.error('[caregiver-availability/update] Audit log failed. slotId=%s err=%s', slotId, auditErr.message)

  revalidatePath('/pages/caregiver/calendar')
  return { error: null }
}

export async function deleteAvailabilitySlotAction(
  caregiverMemberId: string,
  slotId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const member = await resolveMember(supabase, caregiverMemberId)
  if (!member) return { error: 'Caregiver record not found' }
  if (member.user_id !== user.id) return { error: 'Forbidden' }

  const { error } = await q.deleteCaregiverAvailabilitySlot(supabase, slotId, caregiverMemberId)
  if (error) return { error: error.message }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    agency_id: member.agency_id ?? null,
    table_name: 'caregiver_availability_slots',
    record_id: slotId,
    action: 'DELETE',
    performed_by_user_id: user.id,
    details: {},
  })
  if (auditErr) console.error('[caregiver-availability/delete] Audit log failed. slotId=%s err=%s', slotId, auditErr.message)

  revalidatePath('/pages/caregiver/calendar')
  return { error: null }
}
