import 'server-only'

import { cache } from 'react'
import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'

/**
 * Returns the list of allowed feature keys for the agency's plan.
 * Returns null when the agency has no plan assigned (unrestricted access).
 * Uses React cache() so the DB is queried at most once per request.
 */
export const getAgencyAllowedFeatures = cache(
  async (agencyId: string | null): Promise<string[] | null> => {
    if (!agencyId) return null
    if (!z.uuid().safeParse(agencyId).success) return []
    const session = await getSession()
    if (!session) return []

    try {
      return await withActorContext(session.user.id, async () => {
        const [agency] = await sql<{ plan_id: string | null }[]>`
          SELECT agency.plan_id
          FROM public.agencies agency
          JOIN public.user_profiles actor ON actor.id = ${session.user.id}::uuid
          WHERE agency.id = ${agencyId}::uuid
            AND actor.is_active = true
            AND (
              actor.role = 'admin'
              OR EXISTS (
                SELECT 1
                FROM public.user_agency_roles membership
                WHERE membership.user_id = actor.id
                  AND membership.agency_id = agency.id
                  AND membership.role = actor.role
                  AND membership.status = 'active'
              )
            )
          LIMIT 1
        `
        if (!agency) return []
        if (!agency.plan_id) return null
        const features = await sql<{ feature_key: string }[]>`
          SELECT feature_key
          FROM public.plan_features
          WHERE plan_id = ${agency.plan_id}::uuid
          ORDER BY feature_key
        `
        return features.map(feature => feature.feature_key)
      })
    } catch {
      return []
    }
  }
)

/** Returns true when the feature is accessible (null allowed list = unrestricted). */
export function isFeatureAllowed(allowedFeatures: string[] | null, key: string): boolean {
  return allowedFeatures === null || allowedFeatures.includes(key)
}
