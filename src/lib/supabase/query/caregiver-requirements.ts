import sql from '@/db'
import type { PatientSkillSelection } from '@/lib/skill-catalog'

export interface CaregiverRequirement {
  id: string
  agency_id: string
  patient_id: string
  skill_codes: string[]
  preferred_skill_codes: string[]
  required_skills: PatientSkillSelection[]
  preferred_skills: PatientSkillSelection[]
  created_at: string
  updated_at: string
}

async function getPatientAgencyId(patientId: string): Promise<string | null> {
  const rows = await sql`SELECT agency_id FROM patients WHERE id = ${patientId} LIMIT 1`
  return (rows[0]?.agency_id as string | null | undefined) ?? null
}

/** Get skill requirements for a patient (at most one row). */
export async function getCaregiverRequirementsByPatientId(
  patientId: string
): Promise<{ data: CaregiverRequirement | null; error: Error | null }> {
  try {
    const rows = await sql<CaregiverRequirement[]>`
      SELECT requirement.*,
        COALESCE(items.skill_codes, '{}'::text[]) AS skill_codes,
        COALESCE(items.preferred_skill_codes, '{}'::text[]) AS preferred_skill_codes,
        COALESCE(items.required_skills, '[]'::jsonb) AS required_skills,
        COALESCE(items.preferred_skills, '[]'::jsonb) AS preferred_skills
      FROM public.patient_skill_requirements requirement
      LEFT JOIN LATERAL (
        SELECT
          array_agg(catalog.name ORDER BY catalog.name)
            FILTER (WHERE item.requirement_level = 'required') AS skill_codes,
          array_agg(catalog.name ORDER BY catalog.name)
            FILTER (WHERE item.requirement_level = 'preferred') AS preferred_skill_codes,
          jsonb_agg(jsonb_build_object(
            'id', catalog.id, 'code', catalog.code, 'name', catalog.name,
            'categoryId', catalog.category_id,
            'categoryName', COALESCE(category.name, 'Other'),
            'serviceType', catalog.service_type, 'scope', catalog.scope,
            'agencyId', catalog.agency_id, 'isActive', catalog.is_active,
            'requirementLevel', item.requirement_level
          ) ORDER BY category.sort_order NULLS LAST, catalog.name)
            FILTER (WHERE item.requirement_level = 'required') AS required_skills,
          jsonb_agg(jsonb_build_object(
            'id', catalog.id, 'code', catalog.code, 'name', catalog.name,
            'categoryId', catalog.category_id,
            'categoryName', COALESCE(category.name, 'Other'),
            'serviceType', catalog.service_type, 'scope', catalog.scope,
            'agencyId', catalog.agency_id, 'isActive', catalog.is_active,
            'requirementLevel', item.requirement_level
          ) ORDER BY category.sort_order NULLS LAST, catalog.name)
            FILTER (WHERE item.requirement_level = 'preferred') AS preferred_skills
        FROM public.patient_skill_requirement_items item
        JOIN public.credential_catalog catalog ON catalog.id = item.credential_id
        LEFT JOIN public.configuration_values category ON category.id = catalog.category_id
        WHERE item.patient_id = requirement.patient_id
      ) items ON true
      WHERE requirement.patient_id = ${patientId}::uuid
      LIMIT 1
    `
    return { data: rows[0] ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Batch-load skill requirements for many patients. */
export async function getCaregiverRequirementsByPatientIds(
  patientIds: string[]
): Promise<{ data: CaregiverRequirement[] | null; error: Error | null }> {
  if (patientIds.length === 0) return { data: [] as unknown as CaregiverRequirement[], error: null }
  try {
    const rows = await sql<CaregiverRequirement[]>`
      SELECT requirement.id, requirement.agency_id, requirement.patient_id,
        requirement.created_at, requirement.updated_at,
        COALESCE(array_agg(catalog.name ORDER BY catalog.name)
          FILTER (WHERE item.requirement_level = 'required'), '{}'::text[]) AS skill_codes,
        COALESCE(array_agg(catalog.name ORDER BY catalog.name)
          FILTER (WHERE item.requirement_level = 'preferred'), '{}'::text[]) AS preferred_skill_codes,
        '[]'::jsonb AS required_skills,
        '[]'::jsonb AS preferred_skills
      FROM public.patient_skill_requirements requirement
      LEFT JOIN public.patient_skill_requirement_items item ON item.patient_id = requirement.patient_id
      LEFT JOIN public.credential_catalog catalog ON catalog.id = item.credential_id
      WHERE requirement.patient_id = ANY(${patientIds}::uuid[])
      GROUP BY requirement.id
    `
    return { data: rows, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Upsert skill requirements for a patient. */
export async function upsertCaregiverRequirements(
  patientId: string,
  requiredSkillIds: string[],
  preferredSkillIds: string[]
): Promise<{ data: null; error: Error | { message: string } | null }> {
  try {
    const agencyId = await getPatientAgencyId(patientId)
    if (!agencyId) {
      return {
        data: null,
        error: { message: 'Patient has no agency_id; cannot save skill requirements.' },
      }
    }
    const requestedSkills = Array.from(new Set([...requiredSkillIds, ...preferredSkillIds]))
    const catalogRows = requestedSkills.length === 0
      ? []
      : await sql<{ id: string; name: string }[]>`
          SELECT id, name
          FROM public.credential_catalog
          WHERE credential_type = 'skill' AND is_active = true
            AND id = ANY(${requestedSkills}::uuid[])
            AND (scope = 'system' OR agency_id = ${agencyId}::uuid)
        `
    const canonicalIds = new Set(catalogRows.map(row => row.id))
    if (requestedSkills.some(skill => !canonicalIds.has(skill))) {
      return { data: null, error: { message: 'One or more selected skills are no longer available.' } }
    }

    await sql`DELETE FROM public.patient_skill_requirement_items WHERE patient_id = ${patientId}::uuid`
    if (requiredSkillIds.length > 0) {
      await sql`
        INSERT INTO public.patient_skill_requirement_items (
          agency_id, patient_id, credential_id, requirement_level
        )
        SELECT ${agencyId}::uuid, ${patientId}::uuid, skill_id, 'required'
        FROM unnest(${requiredSkillIds}::uuid[]) skill_id
      `
    }
    if (preferredSkillIds.length > 0) {
      await sql`
        INSERT INTO public.patient_skill_requirement_items (
          agency_id, patient_id, credential_id, requirement_level
        )
        SELECT ${agencyId}::uuid, ${patientId}::uuid, skill_id, 'preferred'
        FROM unnest(${preferredSkillIds}::uuid[]) skill_id
      `
    }

    const requiredNames = catalogRows.filter(row => requiredSkillIds.includes(row.id)).map(row => row.name).sort()
    const preferredNames = catalogRows.filter(row => preferredSkillIds.includes(row.id)).map(row => row.name).sort()

    await sql`
      INSERT INTO patient_skill_requirements (
        patient_id, agency_id, skill_codes, preferred_skill_codes
      )
      VALUES (
        ${patientId}, ${agencyId}, ${requiredNames as unknown as string},
        ${preferredNames as unknown as string}
      )
      ON CONFLICT (patient_id)
      DO UPDATE SET
        skill_codes = EXCLUDED.skill_codes,
        preferred_skill_codes = EXCLUDED.preferred_skill_codes,
        updated_at = NOW()
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
