import 'server-only'
import sql from '@/db'
import { BranchError, withBranchActor, saveRecordAttributesWithBranch } from '@/lib/repositories/agency-branches'
import { assertAgencyCapability } from '@/lib/feature-access'
import type { ClientPersonalInfoData } from '@/lib/schemas/client-personal-info'

export async function saveClientPersonalInfo(patientId: string, data: ClientPersonalInfoData) {
  const write = async (actor: { id: string; agencyId: string }) => {
    const changed = await sql`UPDATE public.patients SET first_name = ${data.first_name}, last_name = ${data.last_name},
      gender = ${data.gender || null}, date_of_birth = ${data.date_of_birth || null}, updated_at = now()
      WHERE id = ${patientId}::uuid AND agency_id = ${actor.agencyId}::uuid RETURNING id`
    if (changed.length !== 1) throw new BranchError('Client not found or not authorized.')
    await sql`INSERT INTO public.audit_log(agency_id, table_name, record_id, action, performed_by_user_id, details)
      VALUES (${actor.agencyId}::uuid, 'patients', ${patientId}::uuid, 'UPDATE', ${actor.id}::uuid,
        '{"operation":"update_personal_info"}'::jsonb)`
  }
  if (data.branchId !== undefined) return saveRecordAttributesWithBranch('client', patientId, data.branchId, write)
  return withBranchActor(false, async actor => {
    await assertAgencyCapability(actor.agencyId, 'client_management')
    return write(actor)
  }, false)
}
