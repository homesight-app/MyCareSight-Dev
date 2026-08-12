import type { Supabase } from '../types'
import { withImpliedParents } from '@/lib/constants/feature-keys'

export interface FeaturePlanRow {
  id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
  plan_features: { feature_key: string }[]
  agency_count?: number
}

/** Get all plans with their feature lists and how many agencies are on each plan. */
export async function getFeaturePlans(supabase: Supabase) {
  const [plansResult, agencyCountsResult] = await Promise.all([
    supabase
      .from('feature_plans')
      .select('id, name, description, sort_order, created_at, updated_at, plan_features(feature_key)')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('agencies')
      .select('plan_id')
      .not('plan_id', 'is', null),
  ])

  const plans = (plansResult.data ?? []) as FeaturePlanRow[]
  const agencyCounts: Record<string, number> = {}
  for (const row of agencyCountsResult.data ?? []) {
    const pid = (row as { plan_id: string }).plan_id
    agencyCounts[pid] = (agencyCounts[pid] ?? 0) + 1
  }
  const withCounts = plans.map(p => ({ ...p, agency_count: agencyCounts[p.id] ?? 0 }))

  return { data: withCounts, error: plansResult.error ?? agencyCountsResult.error }
}

/** Get a single plan with its features. */
export async function getFeaturePlanById(supabase: Supabase, planId: string) {
  return supabase
    .from('feature_plans')
    .select('id, name, description, sort_order, created_at, updated_at, plan_features(feature_key)')
    .eq('id', planId)
    .single()
}

/** Insert a new plan. Returns the created row. */
export async function insertFeaturePlan(
  supabase: Supabase,
  data: { name: string; description?: string | null; sort_order?: number }
) {
  return supabase.from('feature_plans').insert(data).select().single()
}

/** Update plan metadata (name, description, sort_order). */
export async function updateFeaturePlanById(
  supabase: Supabase,
  planId: string,
  data: { name?: string; description?: string | null; sort_order?: number; updated_at?: string }
) {
  return supabase.from('feature_plans').update(data).eq('id', planId)
}

/**
 * Replace all feature keys for a plan (delete + re-insert).
 * Auto-adds implied parent keys for any sub-features in the list.
 */
export async function setPlanFeatures(supabase: Supabase, planId: string, featureKeys: string[]) {
  const resolvedKeys = withImpliedParents(featureKeys)

  const { error: deleteError } = await supabase
    .from('plan_features')
    .delete()
    .eq('plan_id', planId)
  if (deleteError) return { error: deleteError }

  if (resolvedKeys.length === 0) return { error: null }

  const rows = resolvedKeys.map(key => ({ plan_id: planId, feature_key: key }))
  const { error: insertError } = await supabase.from('plan_features').insert(rows)
  return { error: insertError }
}

/** Delete a plan (cascades plan_features). Guards: check agency count before deleting. */
export async function deleteFeaturePlanById(supabase: Supabase, planId: string) {
  return supabase.from('feature_plans').delete().eq('id', planId)
}

/** Get the count of agencies currently on a plan. */
export async function getAgencyCountForPlan(supabase: Supabase, planId: string) {
  return supabase
    .from('agencies')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
}

/** Assign (or remove) a plan from an agency. Pass null to remove the plan. */
export async function updateAgencyPlanId(
  supabase: Supabase,
  agencyId: string,
  planId: string | null
) {
  return supabase
    .from('agencies')
    .update({ plan_id: planId })
    .eq('id', agencyId)
}
