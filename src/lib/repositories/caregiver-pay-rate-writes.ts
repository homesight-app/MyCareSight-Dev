import 'server-only'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { z } from 'zod'
import { payRateBatchSchema, type PayRateMutation } from '@/lib/schemas/caregiver-pay-rates'
import { caregiverEditSchema } from '@/lib/schemas/caregiver-edit'
import { zodErrorToFieldErrors } from '@/lib/validation'

export type PayRateSaveResult = { success: boolean; error?: string; fieldErrors?: Record<string,string[]>; caregiverIds?: string[] }
class AccessError extends Error {}

async function sessionActor() {
  const session = await getSession()
  if (!session || !z.uuid().safeParse(session.user.id).success) throw new AccessError('Not authenticated')
  return session.user.id
}

async function managedCaregiver(actorId: string, caregiverId: string) {
  const [member] = await sql<{ id: string; agency_id: string }[]>`
    SELECT member.id, member.agency_id
    FROM public.caregiver_members member
    JOIN public.user_profiles actor ON actor.id = ${actorId}::uuid AND actor.is_active = true
    JOIN public.user_agency_roles membership ON membership.user_id = actor.id
      AND membership.agency_id = member.agency_id AND membership.role = actor.role
      AND membership.status = 'active'
    WHERE member.id = ${caregiverId}::uuid
      AND actor.role IN ('company_owner','care_coordinator')
    LIMIT 1
  `
  if (!member) throw new AccessError('Active agency management membership is required')
  return member
}

async function audit(actorId: string, agencyId: string, table: string, recordId: string, action: string, operation: string, ids: string[]) {
  await sql`
    INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
    VALUES (${agencyId}::uuid,${table},${recordId}::uuid,${action},${actorId}::uuid,
      ${JSON.stringify({ operation, resource_ids: ids })}::jsonb)
  `
}

/** Caller has already validated input. Always invoked inside the authorized transaction. */
async function appendRate(actorId: string, rate: PayRateMutation) {
  const member = await managedCaregiver(actorId, rate.caregiverMemberId)
  // Also taken by the DB timeline guard. Serialize each caregiver/service band.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(
    ${member.agency_id + '/' + member.id + '/' + (rate.serviceType ?? '*')}, 0))`
  const rows = await sql<{ id:string; pay_rate:string; unit_type:string; effective_start:string; effective_end:string|null }[]>`
    SELECT id,pay_rate::text,unit_type,effective_start::text,effective_end::text
    FROM public.caregiver_pay_rates
    WHERE agency_id = ${member.agency_id}::uuid AND caregiver_member_id = ${member.id}::uuid
      AND service_type IS NOT DISTINCT FROM ${rate.serviceType}::text
      AND (effective_end IS NULL OR effective_end > effective_start)
    ORDER BY effective_start ASC
    FOR UPDATE
  `
  const same = rows.find(row => row.effective_start === rate.effectiveDate)
  if (same && Number(same.pay_rate) === rate.payRate && same.unit_type === rate.unitType) {
    await audit(actorId,member.agency_id,'caregiver_pay_rates',same.id,'READ','pay_rate_retry',[same.id])
    return
  }
  const previous = rows.find(row => row.effective_start <= rate.effectiveDate && (!row.effective_end || row.effective_end > rate.effectiveDate))
  if (previous && Number(previous.pay_rate) === rate.payRate && previous.unit_type === rate.unitType) {
    await audit(actorId,member.agency_id,'caregiver_pay_rates',previous.id,'READ','pay_rate_unchanged',[previous.id])
    return
  }
  const next = rows.find(row => row.effective_start > rate.effectiveDate)
  if (previous) {
    const changed = await sql<{id:string}[]>`
      UPDATE public.caregiver_pay_rates SET effective_end = ${rate.effectiveDate}::date, updated_at=now()
      WHERE id = ${previous.id}::uuid RETURNING id
    `
    if (changed.length !== 1) throw new AccessError('The rate changed; reload and retry')
  }
  const [inserted] = await sql<{id:string}[]>`
    INSERT INTO public.caregiver_pay_rates
      (agency_id,caregiver_member_id,pay_rate,effective_start,effective_end,unit_type,service_type)
    VALUES (${member.agency_id}::uuid,${member.id}::uuid,${rate.payRate},
      ${rate.effectiveDate}::date,${next?.effective_start ?? null}::date,${rate.unitType},${rate.serviceType})
    RETURNING id
  `
  if (!inserted) throw new Error('Rate insert failed')
  await audit(actorId,member.agency_id,'caregiver_pay_rates',inserted.id,'INSERT','append_pay_rate',
    previous ? [previous.id,inserted.id] : [inserted.id])
}

function failed(error: unknown): PayRateSaveResult {
  return { success:false,error:error instanceof AccessError ? error.message : 'Unable to save changes. No changes were saved.' }
}

export async function savePayRateBatch(input: unknown): Promise<PayRateSaveResult> {
  const parsed = payRateBatchSchema.safeParse(input)
  if (!parsed.success) return { success:false,fieldErrors:zodErrorToFieldErrors(parsed.error),error:'Check the highlighted fields' }
  try {
    const actorId = await sessionActor()
    await withUserContext(actorId,'',null,async () => {
      // Consistent lock order avoids deadlocks between overlapping batches.
      const rates = [...parsed.data.rates].sort((a,b) =>
        (a.caregiverMemberId + '/' + (a.serviceType ?? '*')).localeCompare(b.caregiverMemberId + '/' + (b.serviceType ?? '*')))
      for (const rate of rates) await appendRate(actorId,rate)
    })
    return { success:true,caregiverIds:[...new Set(parsed.data.rates.map(rate=>rate.caregiverMemberId))] }
  } catch(error) { return failed(error) }
}

export async function saveCaregiverProfile(caregiverId: string, input: unknown): Promise<PayRateSaveResult> {
  const parsed = caregiverEditSchema.safeParse(input)
  if (!parsed.success) return {success:false,error:'Check the highlighted fields',fieldErrors:zodErrorToFieldErrors(parsed.error)}
  if (!z.uuid().safeParse(caregiverId).success) return {success:false,error:'Invalid caregiver'}
  try {
    const actorId = await sessionActor()
    const data = parsed.data
    await withUserContext(actorId,'',null,async () => {
      const member = await managedCaregiver(actorId,caregiverId)
      // Serialize combined edits with other profile/rate edits for this caregiver.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'caregiver-edit/' + caregiverId},0))`
      if (data.pay_rate_hourly?.trim()) {
        const rate = payRateBatchSchema.parse({rates:[{
          caregiverMemberId:caregiverId,payRate:data.pay_rate_hourly,
          effectiveDate:data.pay_rate_effective_date || new Date().toISOString().slice(0,10),
          serviceType:null,unitType:'hour',
        }]}).rates[0]
        await appendRate(actorId,rate)
      }
      const changed = await sql<{id:string}[]>`
        UPDATE public.caregiver_members SET
          first_name=${data.first_name},last_name=${data.last_name},email=${data.email},
          phone=${data.phone || null},role=${data.role},job_title=${data.job_title || null},
          status=${data.status},employee_id=${data.employee_id || null},
          start_date=${data.start_date || null}::date,updated_at=now()
        WHERE id=${caregiverId}::uuid AND agency_id=${member.agency_id}::uuid
        RETURNING id
      `
      if (changed.length!==1) throw new AccessError('Caregiver changed; reload and retry')
      await audit(actorId,member.agency_id,'caregiver_members',caregiverId,'UPDATE','edit_caregiver',[caregiverId])
    })
    return {success:true,caregiverIds:[caregiverId]}
  } catch(error) { return failed(error) }
}
