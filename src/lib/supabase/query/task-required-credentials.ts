import sql from '@/db'

export type CaregiverSkillCatalogItem = {
  type: string
  name: string
}

/**
 * Build caregiver skill catalog from task_required_credentials instead of hardcoded constants.
 * We keep only credential_catalog rows of credential_type = 'skill'.
 */
export async function getCaregiverSkillCatalogFromTaskRequirements(): Promise<{
  data: CaregiverSkillCatalogItem[] | null
  error: Error | null
}> {
  try {
    const rows = await sql`
      SELECT
        json_build_object(
          'task_categories',
          (SELECT json_build_object('name', tcat.name)
           FROM task_categories tcat
           WHERE tcat.id = tc.category_id
           LIMIT 1)
        ) AS task_catalog,
        json_build_object('name', cc.name, 'credential_type', cc.credential_type) AS credential_catalog
      FROM task_required_credentials trc
      LEFT JOIN task_catalog tc ON tc.id = trc.task_id
      LEFT JOIN credential_catalog cc ON cc.id = trc.credential_id
      ORDER BY trc.created_at ASC
    `

    type Row = {
      task_catalog?: { task_categories?: { name?: string | null } | null } | null
      credential_catalog?: { name?: string | null; credential_type?: string | null } | null
    }

    const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
    const out: CaregiverSkillCatalogItem[] = []
    const seen = new Set<string>()

    for (const raw of rows as unknown as Row[]) {
      const task = raw.task_catalog ?? null
      const cred = raw.credential_catalog ?? null
      const credentialType = (cred?.credential_type ?? '').trim().toLowerCase()
      if (credentialType !== 'skill') continue
      const name = (cred?.name ?? '').trim()
      if (!name) continue
      const cat = task ? first(task.task_categories) : null
      const type = (cat?.name ?? '').trim() || 'Other'
      const key = `${type}::${name}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type, name })
    }

    // Same credential name can appear on multiple tasks; missing task category becomes "Other".
    // Prefer a non-"Other" category so display and grouping match the real skill family.
    const bestTypeByName = new Map<string, string>()
    for (const { type, name } of out) {
      const prev = bestTypeByName.get(name)
      if (prev === undefined) bestTypeByName.set(name, type)
      else if (prev === 'Other' && type !== 'Other') bestTypeByName.set(name, type)
    }
    const deduped: CaregiverSkillCatalogItem[] = []
    const seenNames = new Set<string>()
    for (const { name } of out) {
      if (seenNames.has(name)) continue
      seenNames.add(name)
      deduped.push({ name, type: bestTypeByName.get(name)! })
    }

    return { data: deduped, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
