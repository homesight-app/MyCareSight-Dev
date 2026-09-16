import sql from '@/db'
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
export async function getFeaturePlans() {
  try {
    const [planRows, agencyRows] = await Promise.all([
      sql`
        SELECT
          fp.id, fp.name, fp.description, fp.sort_order, fp.created_at, fp.updated_at,
          COALESCE(
            json_agg(json_build_object('feature_key', pf.feature_key)) FILTER (WHERE pf.feature_key IS NOT NULL),
            '[]'
          ) AS plan_features
        FROM feature_plans fp
        LEFT JOIN plan_features pf ON pf.plan_id = fp.id
        GROUP BY fp.id, fp.name, fp.description, fp.sort_order, fp.created_at, fp.updated_at
        ORDER BY fp.sort_order ASC, fp.name ASC
      `,
      sql`SELECT plan_id FROM agencies WHERE plan_id IS NOT NULL`,
    ])

    const agencyCounts: Record<string, number> = {}
    for (const row of agencyRows) {
      const pid = (row as { plan_id: string }).plan_id
      agencyCounts[pid] = (agencyCounts[pid] ?? 0) + 1
    }

    const withCounts = (planRows as unknown as FeaturePlanRow[]).map(p => ({
      ...p,
      agency_count: agencyCounts[p.id] ?? 0,
    }))

    return { data: withCounts, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get a single plan with its features. */
export async function getFeaturePlanById(planId: string) {
  try {
    const rows = await sql`
      SELECT
        fp.id, fp.name, fp.description, fp.sort_order, fp.created_at, fp.updated_at,
        COALESCE(
          json_agg(json_build_object('feature_key', pf.feature_key)) FILTER (WHERE pf.feature_key IS NOT NULL),
          '[]'
        ) AS plan_features
      FROM feature_plans fp
      LEFT JOIN plan_features pf ON pf.plan_id = fp.id
      WHERE fp.id = ${planId}
      GROUP BY fp.id, fp.name, fp.description, fp.sort_order, fp.created_at, fp.updated_at
    `
    if (!rows[0]) throw new Error('Row not found')
    return { data: rows[0] as FeaturePlanRow, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Insert a new plan. Returns the created row. */
export async function insertFeaturePlan(
  data: { name: string; description?: string | null; sort_order?: number }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    const rows = await sql`INSERT INTO feature_plans ${sql(data, ...keys)} RETURNING *`
    return { data: (rows as unknown as any[])[0] ?? null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Update plan metadata (name, description, sort_order). */
export async function updateFeaturePlanById(
  planId: string,
  data: { name?: string; description?: string | null; sort_order?: number; updated_at?: string }
) {
  try {
    const keys = Object.keys(data) as (keyof typeof data)[]
    await sql`UPDATE feature_plans SET ${sql(data, ...keys)} WHERE id = ${planId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/**
 * Replace all feature keys for a plan (delete + re-insert).
 * Auto-adds implied parent keys for any sub-features in the list.
 */
export async function setPlanFeatures(planId: string, featureKeys: string[]) {
  const resolvedKeys = withImpliedParents(featureKeys)

  try {
    await sql`DELETE FROM plan_features WHERE plan_id = ${planId}`
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }

  if (resolvedKeys.length === 0) return { error: null }

  try {
    const rows = resolvedKeys.map(key => ({ plan_id: planId, feature_key: key }))
    for (const row of rows) {
      await sql`INSERT INTO plan_features ${sql(row, 'plan_id', 'feature_key')}`
    }
    return { error: null }
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Delete a plan (cascades plan_features). Guards: check agency count before deleting. */
export async function deleteFeaturePlanById(planId: string) {
  try {
    await sql`DELETE FROM feature_plans WHERE id = ${planId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Get the count of agencies currently on a plan. */
export async function getAgencyCountForPlan(planId: string) {
  try {
    const rows = await sql`SELECT COUNT(*)::int AS count FROM agencies WHERE plan_id = ${planId}`
    return { count: (rows[0] as any | undefined)?.count ?? 0, error: null }
  } catch (err) {
    return { count: 0, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Assign (or remove) a plan from an agency. Pass null to remove the plan. */
export async function updateAgencyPlanId(agencyId: string, planId: string | null) {
  try {
    await sql`UPDATE agencies SET plan_id = ${planId} WHERE id = ${agencyId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
