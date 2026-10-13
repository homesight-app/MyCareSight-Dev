'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { CACHE_TAG_CAREGIVER_SKILL_CATALOG } from '@/lib/cache-tags'
import {
  caregiverSkillSaveSchema,
  skillCatalogCreateSchema,
  skillCatalogSearchSchema,
  skillCatalogUpdateSchema,
  type CaregiverSkillSaveInput,
  type SkillCatalogCreateInput,
  type SkillCatalogSearchInput,
  type SkillCatalogUpdateInput,
} from '@/lib/schemas/skill-catalog'
import {
  getCaregiverSkillSelections,
  searchVisibleSkills,
} from '@/lib/repositories/skills'
import { zodErrorToFieldErrors } from '@/lib/validation'

type ActionResult<T = undefined> = {
  success: boolean
  data?: T
  error?: string
  fieldErrors?: Record<string, string[]>
}

type Actor = { id: string; role: string; agency_id: string | null }

async function withCurrentActor<T>(run: (actor: Actor) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  return withUserContext(
    session.user.id,
    session.profile?.role ?? '',
    session.profile?.agency_id ?? null,
    async () => {
      const [actor] = await sql<Actor[]>`
        SELECT id, role, agency_id
        FROM public.user_profiles
        WHERE id = ${session.user.id}::uuid AND is_active = true
      `
      if (!actor) throw new Error('Forbidden')
      return run(actor)
    }
  )
}

function internalSkillCode(name: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50)
  return `skill_${slug || 'custom'}_${randomUUID().slice(0, 8)}`
}

async function requireSkillCategory(categoryId: string): Promise<void> {
  const [category] = await sql`
    SELECT value.id
    FROM public.configuration_values value
    JOIN public.configuration_types type ON type.id = value.type_id
    WHERE value.id = ${categoryId}::uuid
      AND value.is_active = true
      AND type.code = 'CAREGIVER_SKILL_CATEGORY'
      AND type.is_active = true
    LIMIT 1
  `
  if (!category) throw new Error('Select an active caregiver skill category.')
}

export async function searchSkillCatalogAction(
  input: SkillCatalogSearchInput
): Promise<ActionResult<{ items: Awaited<ReturnType<typeof searchVisibleSkills>>['items']; nextOffset: number | null }>> {
  const parsed = skillCatalogSearchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid skill search.' }
  try {
    const data = await withCurrentActor(async () => searchVisibleSkills(parsed.data))
    return { success: true, data }
  } catch {
    return { success: false, error: 'Unable to search caregiver skills.' }
  }
}

export async function getCaregiverSkillsAction(
  caregiverMemberId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getCaregiverSkillSelections>>>> {
  if (!/^[0-9a-f-]{36}$/i.test(caregiverMemberId)) return { success: false, error: 'Invalid caregiver.' }
  try {
    const data = await withCurrentActor(async actor => {
      const [target] = await sql<{ id: string; agency_id: string; user_id: string | null }[]>`
        SELECT id, agency_id, user_id
        FROM public.caregiver_members
        WHERE id = ${caregiverMemberId}::uuid
      `
      if (!target) throw new Error('Caregiver not found.')
      const [membership] = actor.role === 'admin' ? [{ ok: 1 }] : await sql`
        SELECT 1 AS ok FROM public.user_agency_roles
        WHERE user_id = ${actor.id}::uuid AND agency_id = ${target.agency_id}::uuid
          AND role = ${actor.role} AND status = 'active'
        LIMIT 1
      `
      const manager = actor.role === 'admin' || (
        actor.agency_id === target.agency_id
        && (actor.role === 'company_owner' || actor.role === 'care_coordinator')
        && Boolean(membership)
      )
      const self = target.user_id === actor.id && actor.role === 'staff_member' && Boolean(membership)
      if (!manager && !self) throw new Error('Forbidden')
      return getCaregiverSkillSelections(caregiverMemberId)
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'Unable to load caregiver skills.' }
  }
}

export async function saveCaregiverSkillsAction(
  input: CaregiverSkillSaveInput
): Promise<ActionResult<Awaited<ReturnType<typeof getCaregiverSkillSelections>>>> {
  const parsed = caregiverSkillSaveSchema.safeParse(input)
  if (!parsed.success) return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try {
    const data = await withCurrentActor(async actor => {
      const [target] = await sql<{ id: string; agency_id: string; user_id: string | null }[]>`
        SELECT id, agency_id, user_id
        FROM public.caregiver_members
        WHERE id = ${parsed.data.caregiverMemberId}::uuid AND status = 'active'
        FOR UPDATE
      `
      if (!target) throw new Error('Caregiver not found.')
      const [membership] = actor.role === 'admin' ? [{ ok: 1 }] : await sql`
        SELECT 1 AS ok FROM public.user_agency_roles
        WHERE user_id = ${actor.id}::uuid AND agency_id = ${target.agency_id}::uuid
          AND role = ${actor.role} AND status = 'active'
        LIMIT 1
      `
      const manager = actor.role === 'admin' || (
        actor.agency_id === target.agency_id
        && (actor.role === 'company_owner' || actor.role === 'care_coordinator')
        && Boolean(membership)
      )
      const self = target.user_id === actor.id && actor.role === 'staff_member' && Boolean(membership)
      if (!manager && !self) throw new Error('Forbidden')

      const skillIds = parsed.data.skillIds
      const visibleSkills = skillIds.length === 0 ? [] : await sql<{ id: string }[]>`
        SELECT id FROM public.credential_catalog
        WHERE id = ANY(${skillIds}::uuid[])
          AND credential_type = 'skill' AND is_active = true
          AND (scope = 'system' OR agency_id = ${target.agency_id}::uuid)
        ORDER BY id
      `
      if (visibleSkills.length !== skillIds.length) throw new Error('One or more selected skills are unavailable.')

      await sql`
        DELETE FROM public.caregiver_skill_assignments
        WHERE caregiver_member_id = ${target.id}::uuid
          AND NOT (credential_id = ANY(${skillIds}::uuid[]))
      `
      if (skillIds.length > 0) {
        if (manager) {
          await sql`
            INSERT INTO public.caregiver_skill_assignments (
              agency_id, caregiver_member_id, credential_id, verification_status,
              added_by_user_id, verified_by_user_id, verified_at
            )
            SELECT ${target.agency_id}::uuid, ${target.id}::uuid, selected.id,
              'verified', ${actor.id}::uuid, ${actor.id}::uuid, now()
            FROM unnest(${skillIds}::uuid[]) selected(id)
            ON CONFLICT (caregiver_member_id, credential_id)
            DO UPDATE SET verification_status = 'verified',
              verified_by_user_id = EXCLUDED.verified_by_user_id,
              verified_at = EXCLUDED.verified_at, updated_at = now()
          `
        } else {
          await sql`
            INSERT INTO public.caregiver_skill_assignments (
              agency_id, caregiver_member_id, credential_id, verification_status,
              added_by_user_id
            )
            SELECT ${target.agency_id}::uuid, ${target.id}::uuid, selected.id,
              'self_reported', ${actor.id}::uuid
            FROM unnest(${skillIds}::uuid[]) selected(id)
            ON CONFLICT (caregiver_member_id, credential_id)
            DO NOTHING
          `
        }
      }

      const [verified] = await sql<{ names: string[] }[]>`
        SELECT COALESCE(array_agg(catalog.name ORDER BY catalog.name), '{}'::text[]) AS names
        FROM public.caregiver_skill_assignments assignment
        JOIN public.credential_catalog catalog ON catalog.id = assignment.credential_id
        WHERE assignment.caregiver_member_id = ${target.id}::uuid
          AND assignment.verification_status = 'verified' AND catalog.is_active = true
      `
      await sql`
        UPDATE public.caregiver_members
        SET skills = ${verified?.names ?? []}::text[], updated_at = now()
        WHERE id = ${target.id}::uuid AND agency_id = ${target.agency_id}::uuid
      `
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${target.agency_id}::uuid, 'caregiver_skill_assignments', ${target.id}::uuid,
          'REPLACE', ${actor.id}::uuid,
          ${JSON.stringify({
            operation: manager ? 'manager_replace_caregiver_skills' : 'caregiver_replace_self_reported_skills',
            selected_count: skillIds.length,
          })}::jsonb
        )
      `
      return getCaregiverSkillSelections(target.id)
    })
    revalidatePath('/pages/agency/user-management')
    revalidatePath('/pages/caregiver/my-certifications')
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to save caregiver skills.' }
  }
}

export async function createSystemSkillAction(
  input: SkillCatalogCreateInput
): Promise<ActionResult> {
  const parsed = skillCatalogCreateSchema.safeParse(input)
  if (!parsed.success) return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try {
    await withCurrentActor(async actor => {
      if (actor.role !== 'admin') throw new Error('Forbidden')
      await requireSkillCategory(parsed.data.categoryId)
      const [duplicate] = await sql`
        SELECT id FROM public.credential_catalog
        WHERE credential_type = 'skill' AND scope = 'system'
          AND lower(name) = lower(${parsed.data.name})
        LIMIT 1
      `
      if (duplicate) throw new Error('A system skill with this name already exists.')
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO public.credential_catalog (
          code, name, credential_type, service_type, category_id, scope,
          agency_id, is_active, created_by_user_id
        ) VALUES (
          ${internalSkillCode(parsed.data.name)}, ${parsed.data.name}, 'skill',
          ${parsed.data.serviceType}, ${parsed.data.categoryId}::uuid, 'system',
          NULL, true, ${actor.id}::uuid
        ) RETURNING id
      `
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          NULL, 'credential_catalog', ${created!.id}::uuid, 'INSERT', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'create_system_skill', fields: ['name', 'category_id', 'service_type'] })}::jsonb
        )
      `
    })
    revalidateTag(CACHE_TAG_CAREGIVER_SKILL_CATALOG)
    revalidatePath('/pages/admin/configuration')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to create skill.' }
  }
}

export async function updateSystemSkillAction(
  input: SkillCatalogUpdateInput
): Promise<ActionResult> {
  const parsed = skillCatalogUpdateSchema.safeParse(input)
  if (!parsed.success) return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  try {
    await withCurrentActor(async actor => {
      if (actor.role !== 'admin') throw new Error('Forbidden')
      await requireSkillCategory(parsed.data.categoryId)
      const [skill] = await sql<{ id: string; is_active: boolean }[]>`
        SELECT id, is_active FROM public.credential_catalog
        WHERE id = ${parsed.data.skillId}::uuid
          AND credential_type = 'skill' AND scope = 'system'
        FOR UPDATE
      `
      if (!skill) throw new Error('System skill not found.')
      if (!parsed.data.isActive && skill.is_active) {
        const [usage] = await sql<{ count: number }[]>`
          SELECT count(*)::integer AS count
          FROM public.patient_skill_requirement_items
          WHERE credential_id = ${skill.id}::uuid
        `
        if (Number(usage?.count ?? 0) > 0) {
          throw new Error('Remove this skill from active client requirements before deactivating it.')
        }
      }
      const [duplicate] = await sql`
        SELECT id FROM public.credential_catalog
        WHERE credential_type = 'skill' AND scope = 'system'
          AND lower(name) = lower(${parsed.data.name})
          AND id <> ${skill.id}::uuid
        LIMIT 1
      `
      if (duplicate) throw new Error('A system skill with this name already exists.')
      await sql`
        UPDATE public.credential_catalog
        SET name = ${parsed.data.name}, category_id = ${parsed.data.categoryId}::uuid,
          service_type = ${parsed.data.serviceType}, is_active = ${parsed.data.isActive},
          updated_at = now()
        WHERE id = ${skill.id}::uuid
      `

      await sql`
        UPDATE public.caregiver_members caregiver
        SET skills = source.names, updated_at = now()
        FROM (
          SELECT assignment.caregiver_member_id,
            COALESCE(array_agg(catalog.name ORDER BY catalog.name)
              FILTER (WHERE assignment.verification_status = 'verified' AND catalog.is_active), '{}'::text[]) AS names
          FROM public.caregiver_skill_assignments assignment
          JOIN public.credential_catalog catalog ON catalog.id = assignment.credential_id
          WHERE assignment.caregiver_member_id IN (
            SELECT caregiver_member_id FROM public.caregiver_skill_assignments
            WHERE credential_id = ${skill.id}::uuid
          )
          GROUP BY assignment.caregiver_member_id
        ) source
        WHERE caregiver.id = source.caregiver_member_id
      `
      await sql`
        UPDATE public.patient_skill_requirements requirement
        SET skill_codes = source.required_names,
          preferred_skill_codes = source.preferred_names,
          updated_at = now()
        FROM (
          SELECT item.patient_id,
            COALESCE(array_agg(catalog.name ORDER BY catalog.name)
              FILTER (WHERE item.requirement_level = 'required'), '{}'::text[]) AS required_names,
            COALESCE(array_agg(catalog.name ORDER BY catalog.name)
              FILTER (WHERE item.requirement_level = 'preferred'), '{}'::text[]) AS preferred_names
          FROM public.patient_skill_requirement_items item
          JOIN public.credential_catalog catalog ON catalog.id = item.credential_id
          WHERE item.patient_id IN (
            SELECT patient_id FROM public.patient_skill_requirement_items
            WHERE credential_id = ${skill.id}::uuid
          )
          GROUP BY item.patient_id
        ) source
        WHERE requirement.patient_id = source.patient_id
      `
      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          NULL, 'credential_catalog', ${skill.id}::uuid, 'UPDATE', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'update_system_skill', fields: ['name', 'category_id', 'service_type', 'is_active'] })}::jsonb
        )
      `
    })
    revalidateTag(CACHE_TAG_CAREGIVER_SKILL_CATALOG)
    revalidatePath('/pages/admin/configuration')
    revalidatePath('/pages/agency/clients')
    revalidatePath('/pages/agency/user-management')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to update skill.' }
  }
}

