import { cache } from 'react'
import { createClient } from './supabase/server'

/**
 * Returns the list of allowed feature keys for the agency's plan.
 * Returns null when the agency has no plan assigned (unrestricted access).
 * Uses React cache() so the DB is queried at most once per request.
 */
export const getAgencyAllowedFeatures = cache(
  async (agencyId: string | null): Promise<string[] | null> => {
    if (!agencyId) return null
    const supabase = await createClient()
    const { data: agency } = await supabase
      .from('agencies')
      .select('plan_id')
      .eq('id', agencyId)
      .single()
    if (!agency?.plan_id) return null
    const { data: features } = await supabase
      .from('plan_features')
      .select('feature_key')
      .eq('plan_id', agency.plan_id)
    return (features ?? []).map((f: { feature_key: string }) => f.feature_key)
  }
)

/** Returns true when the feature is accessible (null allowed list = unrestricted). */
export function isFeatureAllowed(allowedFeatures: string[] | null, key: string): boolean {
  return allowedFeatures === null || allowedFeatures.includes(key)
}
