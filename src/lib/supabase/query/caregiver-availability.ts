import sql from '@/db'

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
  caregiverMemberId: string
): Promise<{ data: CaregiverAvailabilitySlotRow[] | null; error: Error | null }> {
  try {
    const rows = await sql`
      SELECT *
      FROM caregiver_availability_slots
      WHERE caregiver_member_id = ${caregiverMemberId}
      ORDER BY created_at ASC
    `
    return { data: rows as unknown as CaregiverAvailabilitySlotRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
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
  payload: CaregiverAvailabilitySlotInput
): Promise<{ data: { id: string } | null; error: Error | null }> {
  try {
    const rows = await sql`
      INSERT INTO caregiver_availability_slots ${sql(payload as Record<string, unknown>, ...Object.keys(payload) as [string, ...string[]])}
      RETURNING id
    `
    return { data: (rows[0] ?? null) as { id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateCaregiverAvailabilitySlot(
  slotId: string,
  caregiverMemberId: string,
  payload: Omit<CaregiverAvailabilitySlotInput, 'caregiver_member_id' | 'agency_id'>
): Promise<{ data: null; error: Error | null }> {
  try {
    await sql`
      UPDATE caregiver_availability_slots
      SET ${sql(payload as Record<string, unknown>, ...Object.keys(payload) as [string, ...string[]])}
      WHERE id = ${slotId}
        AND caregiver_member_id = ${caregiverMemberId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteCaregiverAvailabilitySlot(
  slotId: string,
  caregiverMemberId: string
): Promise<{ data: null; error: Error | null }> {
  try {
    await sql`
      DELETE FROM caregiver_availability_slots
      WHERE id = ${slotId}
        AND caregiver_member_id = ${caregiverMemberId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getCaregiverAvailabilitySlotsByCaregiverIds(
  caregiverMemberIds: string[]
): Promise<{ data: CaregiverAvailabilitySlotRow[] | null; error: Error | null }> {
  if (caregiverMemberIds.length === 0) return { data: [] as unknown as CaregiverAvailabilitySlotRow[], error: null }
  try {
    const rows = await sql`
      SELECT *
      FROM caregiver_availability_slots
      WHERE caregiver_member_id = ANY(${caregiverMemberIds})
      ORDER BY created_at ASC
    `
    return { data: rows as unknown as CaregiverAvailabilitySlotRow[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
