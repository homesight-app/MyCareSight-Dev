import 'server-only'

import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'
import { payRateReadSchema, type PayRateReadInput } from '@/lib/schemas/caregiver-pay-rates'
import { z } from 'zod'

export type PayRateReadRow = {
  id: string
  agency_id: string
  caregiver_member_id: string
  pay_rate: number
  unit_type: string
  service_type: string | null
  effective_start: string
  effective_end: string | null
  created_at: string
}

class AccessError extends Error {}

/** Server-loaded scope; input filters can only narrow it. Staff can read only their own rates. */
function authorizedCaregivers(actorId: string) {
  return sql`
    SELECT member.id, member.agency_id
    FROM public.caregiver_members member
    JOIN public.user_profiles actor ON actor.id = ${actorId}::uuid AND actor.is_active = true
    WHERE member.agency_id IS NOT NULL AND (
      actor.role IN ('admin', 'expert')
      OR (
        actor.role IN ('company_owner', 'care_coordinator', 'staff_member')
        AND EXISTS (
          SELECT 1 FROM public.user_agency_roles membership
          WHERE membership.user_id = actor.id AND membership.agency_id = member.agency_id
            AND membership.role = actor.role AND membership.status = 'active'
        )
        AND (actor.role <> 'staff_member' OR (member.user_id = actor.id AND member.status = 'active'))
      )
    )
  `
}

export async function readCaregiverPayRates(input: PayRateReadInput): Promise<{
  data: PayRateReadRow[] | null; error: string | null
}> {
  try {
    const session = await getSession()
    if (!session || !z.uuid().safeParse(session.user.id).success) throw new AccessError('Not authenticated')
    const parsed = payRateReadSchema.safeParse(input)
    if (!parsed.success) throw new AccessError('Invalid pay-rate request')
    const { caregiverIds, agencyId, effectiveOn, openOnly } = parsed.data

    const data = await withActorContext(session.user.id, async () => {
      const [actor] = await sql<{ role: string }[]>`
        SELECT role FROM public.user_profiles
        WHERE id = ${session.user.id}::uuid AND is_active = true
          AND role IN ('admin','expert','company_owner','care_coordinator','staff_member')
      `
      if (!actor) throw new AccessError('Forbidden')
      if (agencyId) {
        const [scope] = await sql<{ allowed: boolean }[]>`
          SELECT (
            ${actor.role}::text IN ('admin','expert')
            OR EXISTS (
              SELECT 1 FROM public.user_agency_roles membership
              WHERE membership.user_id = ${session.user.id}::uuid
                AND membership.agency_id = ${agencyId}::uuid
                AND membership.role = ${actor.role} AND membership.status = 'active'
            )
          ) AS allowed
        `
        if (!scope?.allowed) throw new AccessError('Forbidden')
      }
      // A report/list request must not quietly turn into a staff member's partial payroll.
      if (caregiverIds === undefined && actor.role === 'staff_member') throw new AccessError('Forbidden')
      if (caregiverIds !== undefined) {
        const allowed = await sql<{ id: string }[]>`
          SELECT id FROM (${authorizedCaregivers(session.user.id)}) allowed
          WHERE id = ANY(${caregiverIds}::uuid[])
            AND (${agencyId ?? null}::uuid IS NULL OR agency_id = ${agencyId ?? null}::uuid)
        `
        if (allowed.length !== caregiverIds.length) throw new AccessError('Forbidden')
      }

      const rows = await sql<PayRateReadRow[]>`
        SELECT rate.id, rate.agency_id, rate.caregiver_member_id, rate.pay_rate,
          rate.unit_type, rate.service_type, rate.effective_start::text, rate.effective_end::text,
          rate.created_at::text
        FROM public.caregiver_pay_rates rate
        JOIN (${authorizedCaregivers(session.user.id)}) allowed
          ON allowed.id = rate.caregiver_member_id AND allowed.agency_id = rate.agency_id
        WHERE (${agencyId ?? null}::uuid IS NULL OR rate.agency_id = ${agencyId ?? null}::uuid)
          AND (${caregiverIds ?? null}::uuid[] IS NULL OR rate.caregiver_member_id = ANY(${caregiverIds ?? null}::uuid[]))
          AND (NOT ${openOnly}::boolean OR rate.effective_end IS NULL)
          AND (${effectiveOn ?? null}::date IS NULL OR (
            rate.effective_start <= ${effectiveOn ?? null}::date
            AND (rate.effective_end IS NULL OR rate.effective_end > ${effectiveOn ?? null}::date)
          ))
        ORDER BY rate.effective_start DESC, rate.created_at DESC, rate.id DESC
      `
      // Fail the read if its audit cannot commit. Never record names, amounts, or date filters.
      await sql`
        INSERT INTO public.audit_log(table_name, record_id, action, performed_by_user_id, details)
        VALUES ('caregiver_pay_rates', NULL, 'READ', ${session.user.id}::uuid,
          ${JSON.stringify({ operation: 'read_pay_rates', resource_ids: rows.map(row => row.id) })}::jsonb)
      `
      return rows.map(row => ({ ...row, pay_rate: Number(row.pay_rate) }))
    })
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error instanceof AccessError ? error.message : 'Unable to load pay rates' }
  }
}

/** Financial callers must not convert authorization/database errors into a zero pay rate. */
export async function requireCaregiverPayRates(input: PayRateReadInput): Promise<PayRateReadRow[]> {
  const result = await readCaregiverPayRates(input)
  if (result.error || !result.data) throw new Error(result.error ?? 'Unable to load pay rates')
  return result.data
}
