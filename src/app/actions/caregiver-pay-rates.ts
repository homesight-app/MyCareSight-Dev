'use server'

import { revalidatePath } from 'next/cache'
import sql from '@/db'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'

const REVAL_PATHS = ['/pages/agency/caregiver', '/pages/agency/time-billing', '/pages/agency/reports/payroll-billing']

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getViewerAgencyId(): Promise<string | null> {
  const session = await getSession()
  const user = session ? { id: session.user.id } : null
  if (!user) return null
  const { data: up } = await q.getAgencyIdFromProfile(user.id)
  return up?.agency_id ?? null
}

/**
 * Close any open pay-rate row for this caregiver (same service_type band) and insert the new rate
 * with effective_start = effectiveDate (and previous row effective_end = same date).
 */
export async function appendCaregiverPayRateAction(input: {
  caregiverMemberId: string
  payRate: number
  /** YYYY-MM-DD; defaults to UTC calendar today. */
  effectiveDate?: string
  /** Pass null for the default rate row (applies to all service types when none specific exists). */
  serviceType?: string | null
}): Promise<{ ok?: true; error?: string }> {
  const { caregiverMemberId, payRate, serviceType = null } = input
  const effectiveDate = (input.effectiveDate?.trim() || todayUtcDate()).slice(0, 10)

  if (!caregiverMemberId) return { error: 'Missing caregiver.' }
  if (!Number.isFinite(payRate) || payRate < 0) return { error: 'Invalid pay rate.' }

  const session = await getSession()
  if (!session) return { error: 'Not signed in.' }

  const viewerAgencyId = await getViewerAgencyId()
  if (!viewerAgencyId) return { error: 'No agency context.' }

  const [cm] = await sql<{ id: string; agency_id: string }[]>`
    SELECT id, agency_id FROM caregiver_members WHERE id = ${caregiverMemberId} LIMIT 1
  `
  if (!cm?.agency_id || cm.agency_id !== viewerAgencyId) {
    return { error: 'Caregiver not found for this agency.' }
  }

  const agencyId = cm.agency_id

  try {
    await sql`
      SELECT append_caregiver_pay_rate(
        p_caregiver_member_id => ${caregiverMemberId},
        p_agency_id           => ${agencyId},
        p_pay_rate            => ${payRate},
        p_effective           => ${effectiveDate},
        p_service_type        => ${serviceType},
        p_unit_type           => 'hour'
      )
    `
  } catch (err: any) {
    return { error: err.message }
  }

  const { error: auditErr } = await q.insertAuditLog({
    agency_id: agencyId,
    table_name: 'caregiver_pay_rates',
    record_id: caregiverMemberId,
    action: 'INSERT',
    performed_by_user_id: session.user.id,
    details: {
      caregiver_member_id: caregiverMemberId,
      pay_rate:            payRate,
      effective_date:      effectiveDate,
      service_type:        serviceType,
    },
  })
  if (auditErr) console.error('[caregiver-pay-rates/append] Audit log failed. caregiverId=%s err=%s', caregiverMemberId, auditErr.message)

  for (const p of REVAL_PATHS) revalidatePath(p)
  return { ok: true }
}
