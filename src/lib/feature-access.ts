import 'server-only'

import { cache } from 'react'
import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'
import type { CapabilityKey } from '@/lib/constants/feature-keys'

const requestCache: typeof cache = typeof cache === 'function'
  ? cache
  : ((fn: (...args: never[]) => unknown) => fn) as typeof cache

export class CapabilityAccessError extends Error {
  constructor() {
    super('This capability is not included in the agency plan.')
    this.name = 'CapabilityAccessError'
  }
}

/**
 * Returns the capabilities granted by the agency's assigned plan. Agencies
 * without a plan retain baseline account access but receive no paid capability.
 */
export const getAgencyAllowedCapabilities = requestCache(
  async (agencyId: string | null): Promise<CapabilityKey[]> => {
    if (!agencyId || !z.uuid().safeParse(agencyId).success) return []
    const session = await getSession()
    if (!session) return []

    try {
      return await withActorContext(session.user.id, async () => {
        const rows = await sql<{ capability_key: CapabilityKey }[]>`
          SELECT plan_capability.capability_key
          FROM public.agencies agency
          JOIN public.user_profiles actor ON actor.id = ${session.user.id}::uuid
          JOIN public.plan_capabilities plan_capability ON plan_capability.plan_id = agency.plan_id
          JOIN public.capability_catalog capability
            ON capability.key = plan_capability.capability_key
           AND capability.is_active = true
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
          ORDER BY plan_capability.capability_key
        `
        return rows.map(row => row.capability_key)
      })
    } catch {
      return []
    }
  }
)

export function isCapabilityAllowed(
  allowedCapabilities: readonly string[],
  capability: CapabilityKey
): boolean {
  return allowedCapabilities.includes(capability)
}

export async function requireAgencyCapability(
  capability: CapabilityKey
): Promise<{ userId: string; agencyId: string; role: string }> {
  const session = await getSession()
  const agencyId = session?.profile?.agency_id ?? null
  if (!session || !agencyId) throw new CapabilityAccessError()
  const allowed = await getAgencyAllowedCapabilities(agencyId)
  if (!allowed.includes(capability)) throw new CapabilityAccessError()
  return { userId: session.user.id, agencyId, role: session.profile?.role ?? '' }
}

/** Use inside an existing actor-scoped transaction or repository boundary. */
export async function assertAgencyCapability(
  agencyId: string,
  capability: CapabilityKey
): Promise<void> {
  const [row] = await sql<{ allowed: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM public.agencies agency
      JOIN public.plan_capabilities plan_capability ON plan_capability.plan_id = agency.plan_id
      JOIN public.capability_catalog catalog
        ON catalog.key = plan_capability.capability_key
       AND catalog.is_active = true
      WHERE agency.id = ${agencyId}::uuid
        AND plan_capability.capability_key = ${capability}
    ) AS allowed
  `
  if (!row?.allowed) throw new CapabilityAccessError()
}
