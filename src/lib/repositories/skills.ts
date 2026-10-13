import 'server-only'

import sql from '@/db'
import type {
  CaregiverSkillSelection,
  PatientSkillSelection,
  SkillCatalogOption,
} from '@/lib/skill-catalog'

type SkillRow = {
  id: string
  code: string
  name: string
  category_id: string | null
  category_name: string | null
  service_type: string | null
  scope: string
  agency_id: string | null
  is_active: boolean
}

function mapSkill(row: SkillRow): SkillCatalogOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name?.trim() || 'Other',
    serviceType: row.service_type === 'skilled' || row.service_type === 'non_skilled'
      ? row.service_type
      : null,
    scope: row.scope === 'agency' ? 'agency' : 'system',
    agencyId: row.agency_id,
    isActive: row.is_active,
  }
}

const SKILL_SELECT = sql`
  catalog.id, catalog.code, catalog.name, catalog.category_id,
  category.name AS category_name, catalog.service_type, catalog.scope,
  catalog.agency_id, catalog.is_active
`

export async function searchVisibleSkills(input: {
  query: string
  categoryId?: string | null
  offset: number
  limit: number
  includeInactive: boolean
}): Promise<{ items: SkillCatalogOption[]; nextOffset: number | null }> {
  const queryPattern = `%${input.query.trim()}%`
  const rows = await sql<SkillRow[]>`
    SELECT ${SKILL_SELECT}
    FROM public.credential_catalog catalog
    LEFT JOIN public.configuration_values category ON category.id = catalog.category_id
    WHERE catalog.credential_type = 'skill'
      AND (${input.includeInactive} OR catalog.is_active = true)
      AND (${input.categoryId ?? null}::uuid IS NULL OR catalog.category_id = ${input.categoryId ?? null}::uuid)
      AND (${input.query.trim()} = '' OR catalog.name ILIKE ${queryPattern} OR catalog.code ILIKE ${queryPattern})
    ORDER BY catalog.is_active DESC, category.sort_order ASC NULLS LAST,
      catalog.display_order ASC, catalog.name ASC, catalog.id ASC
    LIMIT ${input.limit + 1} OFFSET ${input.offset}
  `
  const hasMore = rows.length > input.limit
  return {
    items: rows.slice(0, input.limit).map(mapSkill),
    nextOffset: hasMore ? input.offset + input.limit : null,
  }
}

export async function getVisibleSkillsByIds(ids: string[]): Promise<SkillCatalogOption[]> {
  if (ids.length === 0) return []
  const rows = await sql<SkillRow[]>`
    SELECT ${SKILL_SELECT}
    FROM public.credential_catalog catalog
    LEFT JOIN public.configuration_values category ON category.id = catalog.category_id
    WHERE catalog.credential_type = 'skill' AND catalog.id = ANY(${ids}::uuid[])
    ORDER BY category.sort_order ASC NULLS LAST, catalog.display_order ASC, catalog.name ASC
  `
  return rows.map(mapSkill)
}

export async function getCaregiverSkillSelections(
  caregiverMemberId: string
): Promise<CaregiverSkillSelection[]> {
  const rows = await sql<(SkillRow & { verification_status: 'self_reported' | 'verified' })[]>`
    SELECT ${SKILL_SELECT}, assignment.verification_status
    FROM public.caregiver_skill_assignments assignment
    JOIN public.credential_catalog catalog ON catalog.id = assignment.credential_id
    LEFT JOIN public.configuration_values category ON category.id = catalog.category_id
    WHERE assignment.caregiver_member_id = ${caregiverMemberId}::uuid
    ORDER BY category.sort_order ASC NULLS LAST, catalog.name ASC
  `
  return rows.map(row => ({ ...mapSkill(row), verificationStatus: row.verification_status }))
}

export async function getPatientSkillSelections(patientId: string): Promise<PatientSkillSelection[]> {
  const rows = await sql<(SkillRow & { requirement_level: 'required' | 'preferred' })[]>`
    SELECT ${SKILL_SELECT}, item.requirement_level
    FROM public.patient_skill_requirement_items item
    JOIN public.credential_catalog catalog ON catalog.id = item.credential_id
    LEFT JOIN public.configuration_values category ON category.id = catalog.category_id
    WHERE item.patient_id = ${patientId}::uuid
    ORDER BY item.requirement_level, category.sort_order ASC NULLS LAST, catalog.name ASC
  `
  return rows.map(row => ({ ...mapSkill(row), requirementLevel: row.requirement_level }))
}

