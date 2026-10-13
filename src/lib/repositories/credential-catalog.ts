import 'server-only'

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { z } from 'zod'

export type CaregiverSkillCatalogItem = { type: string; name: string }
type Result = { data: CaregiverSkillCatalogItem[] | null; error: { message: string } | null }
class AccessError extends Error {}

/** Global reference labels only; no caregiver credentials or patient records. */
export async function getCaregiverSkillCatalogFromTaskRequirements(): Promise<Result> {
  try {
    const session = await getSession()
    if (!session || !z.uuid().safeParse(session.user.id).success) throw new AccessError('Unauthorized')

    // Policies load current Neon permissions by actor ID, not stale session role/agency.
    const data = await withUserContext(session.user.id, '', null, async () => {
      const actors = await sql<{ id: string }[]>`
        SELECT actor.id FROM public.user_profiles actor
        WHERE actor.id = ${session.user.id}::uuid AND actor.is_active = true
          AND (
            actor.role IN ('admin', 'expert')
            OR (
              actor.role IN ('company_owner', 'care_coordinator', 'staff_member')
              AND EXISTS (
                SELECT 1 FROM public.user_agency_roles membership
                WHERE membership.user_id = actor.id AND membership.role = actor.role
                  AND membership.status = 'active'
              )
            )
          )
      `
      if (!actors.length) throw new AccessError('Forbidden')

      const rows = await sql<{
        name: string
        credential_type: string
        category_name: string | null
        display_order: number
      }[]>`
        SELECT cc.name, cc.credential_type,
          category.name AS category_name,
          cc.display_order
        FROM public.credential_catalog cc
        LEFT JOIN public.configuration_values category ON category.id = cc.category_id
        WHERE cc.is_active = true AND cc.credential_type = 'skill'
        ORDER BY category.sort_order ASC NULLS LAST, cc.display_order ASC, cc.name ASC
      `
      // Compatibility shape for existing read-only displays. Editors use stable IDs.
      const catalog = new Map<string, string>()
      for (const row of rows) {
        if (row.credential_type.trim().toLowerCase() !== 'skill') continue
        const name = row.name.trim()
        if (!name) continue
        const type = row.category_name?.trim() || 'Other'
        if (!catalog.has(name) || (catalog.get(name) === 'Other' && type !== 'Other')) {
          catalog.set(name, type)
        }
      }
      return Array.from(catalog, ([name, type]) => ({ name, type }))
    })
    return { data, error: null }
  } catch (error) {
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Unable to load skill catalog' } }
  }
}
