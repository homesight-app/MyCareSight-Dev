'use server'

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { readCaregiverPayRates } from '@/lib/repositories/caregiver-pay-rates'
import { caregiverHomeAddressSchema, type CaregiverHomeAddressInput } from '@/lib/schemas/caregiver-profile'
import { zodErrorToFieldErrors } from '@/lib/validation'
import { revalidatePath } from 'next/cache'
import { assertAgencyCapability } from '@/lib/feature-access'

export type CaregiverPayRateHistoryRow = {
  id: string
  pay_rate: number | null
  unit_type: string | null
  service_type: string | null
  effective_start: string
  effective_end: string | null
  created_at: string
}

export type CaregiverScheduleRow = {
  id: string
  patient_id: string | null
  visit_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  service_type: string | null
  status: string | null
  is_recurring: boolean | null
}

const PLATFORM_ROLES = new Set(['admin', 'expert'])

export async function updateCaregiverHomeAddressAction(input: CaregiverHomeAddressInput): Promise<{
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}> {
  const parsed = caregiverHomeAddressSchema.safeParse(input)
  if (!parsed.success) return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  try {
    await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
      const [actor] = await sql<{ id: string; role: string; agency_id: string | null }[]>`
        SELECT id, role, agency_id FROM public.user_profiles
        WHERE id = ${session.user.id}::uuid AND is_active = true
      `
      const [member] = await sql<{ id: string; agency_id: string; user_id: string | null }[]>`
        SELECT id, agency_id, user_id FROM public.caregiver_members
        WHERE id = ${parsed.data.caregiverMemberId}::uuid
        FOR UPDATE
      `
      if (!actor || !member) throw new Error('Caregiver not found.')
      const isPlatformAdmin = actor.role === 'admin'
      const hasActiveMembership = actor.agency_id === member.agency_id && Boolean((await sql`
        SELECT 1 FROM public.user_agency_roles
        WHERE user_id = ${actor.id}::uuid AND agency_id = ${member.agency_id}::uuid
          AND role = ${actor.role} AND status = 'active'
        LIMIT 1
      `)[0])
      const isSelf = actor.role === 'staff_member' && member.user_id === actor.id && hasActiveMembership
      const isManager = actor.agency_id === member.agency_id
        && (actor.role === 'company_owner' || actor.role === 'care_coordinator')
        && hasActiveMembership
      if (!isPlatformAdmin && !isSelf && !isManager) throw new Error('Forbidden')
      if (isManager) {
        await assertAgencyCapability(member.agency_id, 'caregiver_management')
      }

      const address = [parsed.data.streetAddress, parsed.data.city].filter(Boolean).join(', ')
      await sql`
        UPDATE public.caregiver_members
        SET address = ${address || null}, state = ${parsed.data.state || null},
          zip_code = ${parsed.data.zipCode || null}, updated_at = now()
        WHERE id = ${member.id}::uuid AND agency_id = ${member.agency_id}::uuid
      `
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${member.agency_id}::uuid, 'caregiver_members', ${member.id}::uuid,
          'UPDATE', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'update_caregiver_home_address', fields: ['address', 'state', 'zip_code'] })}::jsonb
        )
      `
    })
    revalidatePath('/pages/agency/user-management')
    revalidatePath('/pages/caregiver')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to update home address.' }
  }
}

async function resolveAuthorizedCaregiver(
  caregiverMemberId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>
): Promise<{ id: string; agency_id: string | null } | null> {
  const role = session.profile?.role ?? ''
  const viewerAgencyId = session.profile?.agency_id ?? null
  const [member] = await sql<{ id: string; agency_id: string | null; user_id: string | null }[]>`
    SELECT id, agency_id, user_id
    FROM caregiver_members
    WHERE id = ${caregiverMemberId}
    LIMIT 1
  `
  if (!member) return null
  if (PLATFORM_ROLES.has(role)) return member
  if (member.user_id === session.user.id) return member
  if (viewerAgencyId && member.agency_id === viewerAgencyId) return member
  return null
}

export async function getCaregiverPayRateHistoryAction(
  caregiverMemberId: string
): Promise<{ data: CaregiverPayRateHistoryRow[]; error: string | null }> {
  const result = await readCaregiverPayRates({ caregiverIds: [caregiverMemberId] })
  return { data: result.data ?? [], error: result.error }
}

export async function getCaregiverSchedulesAction(
  caregiverMemberId: string,
  todayYmd: string
): Promise<{ data: CaregiverScheduleRow[]; error: string | null }> {
  const session = await getSession()
  if (!session) return { data: [], error: 'Not authenticated' }
  const today = /^\d{4}-\d{2}-\d{2}$/.test(todayYmd) ? todayYmd : new Date().toISOString().slice(0, 10)

  return withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const member = await resolveAuthorizedCaregiver(caregiverMemberId, session)
    if (!member?.agency_id) return { data: [], error: 'Caregiver not found or not authorized' }
    await assertAgencyCapability(member.agency_id, 'care_operations')

    const upcomingRows = await sql<CaregiverScheduleRow[]>`
      SELECT id, patient_id, visit_date, scheduled_start_time, scheduled_end_time, service_type, status, is_recurring
      FROM scheduled_visits
      WHERE caregiver_member_id = ${caregiverMemberId}
        AND agency_id = ${member.agency_id}
        AND visit_date >= ${today}
      ORDER BY visit_date ASC
      LIMIT 20
    `
    if (upcomingRows.length > 0) return { data: upcomingRows, error: null }

    const recentRows = await sql<CaregiverScheduleRow[]>`
      SELECT id, patient_id, visit_date, scheduled_start_time, scheduled_end_time, service_type, status, is_recurring
      FROM scheduled_visits
      WHERE caregiver_member_id = ${caregiverMemberId}
        AND agency_id = ${member.agency_id}
      ORDER BY visit_date DESC
      LIMIT 10
    `
    return { data: recentRows, error: null }
  })
}
