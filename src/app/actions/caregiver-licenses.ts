'use server'

import { revalidatePath } from 'next/cache'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { assertAgencyCapability } from '@/lib/feature-access'
import {
  caregiverCredentialInputSchema,
  type CaregiverCredentialInput,
} from '@/lib/schemas/caregiver-credential'

type ManagerActor = { id: string; role: string; agency_id: string | null }
type CaregiverTarget = { id: string; agency_id: string; user_id: string | null }

function credentialStatus(expiryDate: string | null): 'active' | 'expiring' | 'expired' {
  if (!expiryDate) return 'active'
  const end = new Date(`${expiryDate}T00:00:00Z`).getTime()
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const days = Math.ceil((end - todayUtc) / 86_400_000)
  if (days <= 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'active'
}

async function withCredentialManager<T>(
  staffMemberId: string,
  run: (actor: ManagerActor, target: CaregiverTarget) => Promise<T>
): Promise<T> {
  const session = await getSession()
  if (!session?.user?.id) throw new Error('You must be signed in.')

  return withUserContext(
    session.user.id,
    session.profile?.role ?? '',
    session.profile?.agency_id ?? null,
    async () => {
      const [actor] = await sql<ManagerActor[]>`
        SELECT id, role, agency_id
        FROM public.user_profiles
        WHERE id = ${session.user.id}::uuid AND is_active = true
      `
      if (!actor) throw new Error('You do not have permission to manage caregiver credentials.')

      const [target] = await sql<CaregiverTarget[]>`
        SELECT id, agency_id, user_id
        FROM public.caregiver_members
        WHERE id = ${staffMemberId}::uuid
      `
      if (!target) throw new Error('Caregiver not found.')

      const platformAdmin = actor.role === 'admin'
      const [membership] = platformAdmin ? [{ allowed: true }] : await sql<{ allowed: boolean }[]>`
        SELECT true AS allowed
        FROM public.user_agency_roles
        WHERE user_id = ${actor.id}::uuid
          AND agency_id = ${target.agency_id}::uuid
          AND role = ${actor.role}
          AND status = 'active'
          AND role IN ('company_owner', 'care_coordinator')
        LIMIT 1
      `
      if (!platformAdmin && (!membership || actor.agency_id !== target.agency_id)) {
        throw new Error('You do not have permission to manage caregiver credentials.')
      }
      if (!platformAdmin) await assertAgencyCapability(target.agency_id, 'caregiver_management')
      return run(actor, target)
    }
  )
}

function revalidateCaregiverCredentials(staffMemberId: string) {
  revalidatePath('/pages/agency/user-management')
  revalidatePath(`/pages/agency/caregiver/${staffMemberId}`)
  revalidatePath('/pages/caregiver/my-certifications')
}

export async function insertCaregiverLicenseApplicationAction(
  input: CaregiverCredentialInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = caregiverCredentialInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid certification.' }

  try {
    const id = await withCredentialManager(parsed.data.staffMemberId, async (actor, target) => {
      const status = credentialStatus(parsed.data.expiryDate)
      const [inserted] = await sql<{ id: string }[]>`
        INSERT INTO public.caregiver_credentials (
          agency_id, caregiver_member_id, user_id, source_credential_name,
          credential_number, state, status, issue_date, expiration_date,
          issuing_authority, verified
        ) VALUES (
          ${target.agency_id}::uuid, ${target.id}::uuid, ${target.user_id}::uuid,
          ${parsed.data.licenseType}, ${parsed.data.licenseNumber},
          ${parsed.data.state || null}, ${status}, ${parsed.data.issueDate}::date,
          ${parsed.data.expiryDate}::date, ${parsed.data.issuingAuthority || null}, true
        )
        RETURNING id
      `
      if (!inserted) throw new Error('Certification was not saved.')
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${target.agency_id}::uuid, 'caregiver_credentials', ${inserted.id}::uuid,
          'INSERT', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'manager_add_caregiver_credential' })}::jsonb
        )
      `
      return inserted.id
    })
    revalidateCaregiverCredentials(parsed.data.staffMemberId)
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to save certification.' }
  }
}

export async function updateCaregiverLicenseAction(
  input: CaregiverCredentialInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = caregiverCredentialInputSchema.safeParse(input)
  if (!parsed.success || !parsed.data.credentialId) {
    return { ok: false, error: parsed.success ? 'Certification is required.' : parsed.error.issues[0]?.message ?? 'Invalid certification.' }
  }
  const data = parsed.data
  const credentialId = data.credentialId!

  try {
    await withCredentialManager(data.staffMemberId, async (actor, target) => {
      const status = credentialStatus(data.expiryDate)
      const [updated] = await sql<{ id: string }[]>`
        UPDATE public.caregiver_credentials
        SET source_credential_name = ${data.licenseType},
            credential_number = ${data.licenseNumber},
            state = ${data.state || null}, status = ${status},
            issue_date = ${data.issueDate}::date,
            expiration_date = ${data.expiryDate}::date,
            issuing_authority = ${data.issuingAuthority || null},
            verified = true, updated_at = now()
        WHERE id = ${credentialId}::uuid
          AND caregiver_member_id = ${target.id}::uuid
          AND agency_id = ${target.agency_id}::uuid
        RETURNING id
      `
      if (!updated) throw new Error('Certification not found or unavailable.')
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${target.agency_id}::uuid, 'caregiver_credentials', ${updated.id}::uuid,
          'UPDATE', ${actor.id}::uuid,
          ${JSON.stringify({
            operation: 'manager_update_caregiver_credential',
            changed_fields: ['type', 'number', 'state', 'status', 'issue_date', 'expiration_date', 'issuing_authority'],
          })}::jsonb
        )
      `
    })
    revalidateCaregiverCredentials(data.staffMemberId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to update certification.' }
  }
}
