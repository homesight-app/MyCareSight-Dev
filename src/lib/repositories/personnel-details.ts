import 'server-only'
import { z } from 'zod'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { encryptSSNWithMetadata, ssnToLast4 } from '@/lib/ssn-crypto'
import {
  personnelDetailsSchema,
  personnelTargetSchema,
  type PersonnelDetailsInput,
  type PersonnelTarget,
} from '@/lib/schemas/personnel-details'
import { zodErrorToFieldErrors } from '@/lib/validation'

export interface PersonnelDetailsView {
  birth_date: string
  hire_date: string
  ssn_last4: string | null
  home_address_street: string
  home_address_city: string
  home_address_state: string
  home_address_zip: string
  can_edit_sensitive: boolean
}

export type PersonnelDetailsResult = {
  success: boolean
  data?: PersonnelDetailsView
  error?: string
  fieldErrors?: Record<string, string[]>
}

class PersonnelAccessError extends Error {}

type Actor = { id: string; role: string; agencyId: string | null }
type Target = { userId: string; agencyId: string }

async function loadActor(): Promise<Actor> {
  const session = await getSession()
  if (!session || !z.uuid().safeParse(session.user.id).success) {
    throw new PersonnelAccessError('Not authenticated')
  }
  return {
    id: session.user.id,
    role: session.profile?.role ?? '',
    agencyId: session.profile?.agency_id ?? null,
  }
}

async function resolveAuthorizedTarget(actor: Actor, targetInput: PersonnelTarget): Promise<Target> {
  const target = personnelTargetSchema.parse(targetInput)
  const [person] = target.userProfileId
    ? await sql<{ user_id: string; agency_id: string }[]>`
        SELECT profile.id AS user_id, profile.agency_id
        FROM public.user_profiles profile
        WHERE profile.id = ${target.userProfileId}::uuid
          AND profile.agency_id = ${target.agencyId}::uuid
          AND profile.role IN ('company_owner', 'care_coordinator', 'staff_member')
        LIMIT 1
      `
    : await sql<{ user_id: string; agency_id: string }[]>`
        SELECT profile.id AS user_id, caregiver.agency_id
        FROM public.caregiver_members caregiver
        JOIN public.user_profiles profile
          ON profile.id = caregiver.user_id
         AND profile.agency_id = caregiver.agency_id
         AND profile.role = 'staff_member'
        WHERE caregiver.id = ${target.caregiverMemberId!}::uuid
          AND caregiver.agency_id = ${target.agencyId}::uuid
        LIMIT 1
      `
  if (!person) throw new PersonnelAccessError('Personnel record not found')

  if (actor.role === 'admin') return { userId: person.user_id, agencyId: person.agency_id }
  if (actor.role !== 'company_owner' && actor.role !== 'care_coordinator') {
    throw new PersonnelAccessError('Forbidden')
  }
  const [membership] = await sql<{ ok: boolean }[]>`
    SELECT true AS ok
    FROM public.user_agency_roles
    WHERE user_id = ${actor.id}::uuid
      AND agency_id = ${person.agency_id}::uuid
      AND role = ${actor.role}
      AND status = 'active'
    LIMIT 1
  `
  if (!membership || actor.agencyId !== person.agency_id) throw new PersonnelAccessError('Forbidden')
  return { userId: person.user_id, agencyId: person.agency_id }
}

function emptyView(canEditSensitive: boolean): PersonnelDetailsView {
  return {
    birth_date: '',
    hire_date: '',
    ssn_last4: null,
    home_address_street: '',
    home_address_city: '',
    home_address_state: '',
    home_address_zip: '',
    can_edit_sensitive: canEditSensitive,
  }
}

function failed(error: unknown): PersonnelDetailsResult {
  return {
    success: false,
    error: error instanceof PersonnelAccessError ? error.message : 'Unable to access personnel details.',
  }
}

export async function readPersonnelDetails(targetInput: unknown): Promise<PersonnelDetailsResult> {
  const parsedTarget = personnelTargetSchema.safeParse(targetInput)
  if (!parsedTarget.success) return { success: false, error: 'Invalid personnel record' }
  try {
    const actor = await loadActor()
    return await withUserContext(actor.id, actor.role, actor.agencyId, async () => {
      const target = await resolveAuthorizedTarget(actor, parsedTarget.data)
      const canEditSensitive = actor.role === 'admin' || actor.role === 'company_owner'
      const [row] = await sql<{
        id: string
        birth_date: string | null
        hire_date: string | null
        ssn_last4: string | null
        home_address_street: string | null
        home_address_city: string | null
        home_address_state: string | null
        home_address_zip: string | null
      }[]>`
        SELECT id, birth_date, hire_date, ssn_last4,
          home_address_street, home_address_city, home_address_state, home_address_zip
        FROM public.agency_personnel_private
        WHERE agency_id = ${target.agencyId}::uuid AND user_id = ${target.userId}::uuid
        LIMIT 1
      `
      await sql`
        INSERT INTO public.audit_log
          (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (${target.agencyId}::uuid, 'agency_personnel_private',
          ${row?.id ?? target.userId}::uuid, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_private_personnel' })}::jsonb)
      `
      if (!row) return { success: true, data: emptyView(canEditSensitive) }
      return {
        success: true,
        data: {
          birth_date: row.birth_date ?? '',
          hire_date: row.hire_date ?? '',
          ssn_last4: row.ssn_last4,
          home_address_street: row.home_address_street ?? '',
          home_address_city: row.home_address_city ?? '',
          home_address_state: row.home_address_state ?? '',
          home_address_zip: row.home_address_zip ?? '',
          can_edit_sensitive: canEditSensitive,
        },
      }
    })
  } catch (error) {
    return failed(error)
  }
}

export async function savePersonnelDetails(
  targetInput: unknown,
  detailsInput: PersonnelDetailsInput
): Promise<PersonnelDetailsResult> {
  const parsedTarget = personnelTargetSchema.safeParse(targetInput)
  const parsedDetails = personnelDetailsSchema.safeParse(detailsInput)
  if (!parsedTarget.success) return { success: false, error: 'Invalid personnel record' }
  if (!parsedDetails.success) {
    return {
      success: false,
      error: 'Check the highlighted fields',
      fieldErrors: zodErrorToFieldErrors(parsedDetails.error),
    }
  }

  try {
    const actor = await loadActor()
    return await withUserContext(actor.id, actor.role, actor.agencyId, async () => {
      const target = await resolveAuthorizedTarget(actor, parsedTarget.data)
      const data = parsedDetails.data
      const canEditSensitive = actor.role === 'admin' || actor.role === 'company_owner'
      const [existing] = await sql<{
        id: string
        birth_date: string | null
        ssn_encrypted: string | null
        ssn_last4: string | null
        ssn_key_id: string | null
      }[]>`
        SELECT id, birth_date, ssn_encrypted, ssn_last4, ssn_key_id
        FROM public.agency_personnel_private
        WHERE agency_id = ${target.agencyId}::uuid AND user_id = ${target.userId}::uuid
        FOR UPDATE
      `

      if (!canEditSensitive) {
        if ((data.birth_date || null) !== (existing?.birth_date ?? null) || data.ssn_action !== 'keep') {
          throw new PersonnelAccessError('Only an agency owner or platform administrator can change birth date or SSN.')
        }
      }

      let encrypted = existing?.ssn_encrypted ?? null
      let last4 = existing?.ssn_last4 ?? null
      let keyId = existing?.ssn_key_id ?? null
      if (data.ssn_action === 'replace') {
        const digits = data.ssn.replace(/\D/g, '')
        const result = await encryptSSNWithMetadata(digits, {
          agencyId: target.agencyId,
          recordId: target.userId,
          field: 'personnel_ssn',
        })
        encrypted = result.ciphertext
        last4 = ssnToLast4(digits)
        keyId = result.keyId
      } else if (data.ssn_action === 'clear') {
        encrypted = null
        last4 = null
        keyId = null
      }

      const [saved] = await sql<{ id: string }[]>`
        INSERT INTO public.agency_personnel_private (
          agency_id, user_id, birth_date, hire_date, ssn_encrypted, ssn_last4,
          ssn_key_id, home_address_street, home_address_city,
          home_address_state, home_address_zip, created_by_user_id
        ) VALUES (
          ${target.agencyId}::uuid, ${target.userId}::uuid,
          ${data.birth_date || null}::date, ${data.hire_date || null}::date,
          ${encrypted}, ${last4}, ${keyId},
          ${data.home_address_street || null}, ${data.home_address_city || null},
          ${data.home_address_state || null}, ${data.home_address_zip || null},
          ${actor.id}::uuid
        )
        ON CONFLICT (agency_id, user_id) DO UPDATE SET
          birth_date = EXCLUDED.birth_date,
          hire_date = EXCLUDED.hire_date,
          ssn_encrypted = EXCLUDED.ssn_encrypted,
          ssn_last4 = EXCLUDED.ssn_last4,
          ssn_key_id = EXCLUDED.ssn_key_id,
          home_address_street = EXCLUDED.home_address_street,
          home_address_city = EXCLUDED.home_address_city,
          home_address_state = EXCLUDED.home_address_state,
          home_address_zip = EXCLUDED.home_address_zip,
          updated_at = now()
        RETURNING id
      `
      if (!saved) throw new Error('Personnel details were not saved')

      // Preserve the existing caregiver location mirror used by proximity matching.
      // The private personnel table remains the authoritative structured address.
      await sql`
        UPDATE public.caregiver_members
        SET address = ${data.home_address_street || null},
            state = ${data.home_address_state || null},
            zip_code = ${data.home_address_zip || null},
            updated_at = now()
        WHERE user_id = ${target.userId}::uuid
          AND agency_id = ${target.agencyId}::uuid
      `

      await sql`
        INSERT INTO public.audit_log
          (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (${target.agencyId}::uuid, 'agency_personnel_private', ${saved.id}::uuid,
          'UPDATE_PRIVATE_PERSONNEL', ${actor.id}::uuid,
          ${JSON.stringify({
            changed_fields: [
              'birth_date', 'hire_date', 'home_address_street', 'home_address_city',
              'home_address_state', 'home_address_zip',
              ...(data.ssn_action === 'keep' ? [] : ['ssn']),
            ],
            ssn_action: data.ssn_action,
          })}::jsonb)
      `

      return {
        success: true,
        data: {
          birth_date: data.birth_date,
          hire_date: data.hire_date,
          ssn_last4: last4,
          home_address_street: data.home_address_street,
          home_address_city: data.home_address_city,
          home_address_state: data.home_address_state,
          home_address_zip: data.home_address_zip,
          can_edit_sensitive: canEditSensitive,
        },
      }
    })
  } catch (error) {
    return failed(error)
  }
}
