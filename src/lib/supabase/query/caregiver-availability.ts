import type { Supabase } from '../types'

export type CaregiverAvailabilitySlotRow = {
  id: string
  caregiver_member_id: string
  agency_id: string | null
  label: string | null
  is_recurring: boolean
  start_time: string
  end_time: string
  repeat_frequency: string | null
  days_of_week: number[] | null
  repeat_start: string | null
  repeat_end: string | null
  specific_date: string | null
  created_at: string
  updated_at: string
}

export async function getCaregiverAvailabilitySlots(
  supabase: Supabase,
  caregiverMemberId: string
) {
  return supabase
    .from('caregiver_availability_slots')
    .select('*')
    .eq('caregiver_member_id', caregiverMemberId)
    .order('created_at', { ascending: true })
}

export type CaregiverAvailabilitySlotInput = {
  caregiver_member_id: string
  agency_id?: string | null
  label?: string | null
  is_recurring: boolean
  start_time: string
  end_time: string
  repeat_frequency?: string | null
  days_of_week?: number[] | null
  repeat_start?: string | null
  repeat_end?: string | null
  specific_date?: string | null
}

export async function insertCaregiverAvailabilitySlot(
  supabase: Supabase,
  payload: CaregiverAvailabilitySlotInput
) {
  return supabase
    .from('caregiver_availability_slots')
    .insert(payload)
    .select('id')
    .single()
}

export async function updateCaregiverAvailabilitySlot(
  supabase: Supabase,
  slotId: string,
  caregiverMemberId: string,
  payload: Omit<CaregiverAvailabilitySlotInput, 'caregiver_member_id' | 'agency_id'>
) {
  return supabase
    .from('caregiver_availability_slots')
    .update(payload)
    .eq('id', slotId)
    .eq('caregiver_member_id', caregiverMemberId)
}

export async function deleteCaregiverAvailabilitySlot(
  supabase: Supabase,
  slotId: string,
  caregiverMemberId: string
) {
  return supabase
    .from('caregiver_availability_slots')
    .delete()
    .eq('id', slotId)
    .eq('caregiver_member_id', caregiverMemberId)
}

export async function getCaregiverAvailabilitySlotsByCaregiverIds(
  supabase: Supabase,
  caregiverMemberIds: string[]
) {
  if (caregiverMemberIds.length === 0) return { data: [] as CaregiverAvailabilitySlotRow[], error: null }
  return supabase
    .from('caregiver_availability_slots')
    .select('*')
    .in('caregiver_member_id', caregiverMemberIds)
    .order('created_at', { ascending: true })
}
