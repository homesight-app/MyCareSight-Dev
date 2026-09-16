import sql from '@/db'

type TaskCategoryEmbed = { name?: string | null; service_type?: string | null } | null

type TaskCatalogAdlRow = {
  name: string | null
  task_categories?: TaskCategoryEmbed | TaskCategoryEmbed[]
}

type TaskCatalogSkilledRow = {
  id?: string | null
  code?: string | null
  name: string | null
    description?: string | null
  task_categories?: TaskCategoryEmbed | TaskCategoryEmbed[]
}

function firstCategory(v: TaskCategoryEmbed | TaskCategoryEmbed[] | null | undefined): TaskCategoryEmbed {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

/** ADL/IADL options sourced from task_catalog for patient ADL planning UI. */
export async function getTaskCatalogAdlLists(): Promise<{
  data: Array<{ name: string; group: string }> | null
  error: Error | null
}> {
  try {
    const rows = await sql`
      SELECT tc.name, json_build_object('name', tcat.name, 'service_type', tcat.service_type) AS task_categories
      FROM task_catalog tc
      INNER JOIN task_categories tcat ON tcat.id = tc.category_id
      WHERE tc.is_active = true
        AND tcat.service_type = 'non_skilled'
      ORDER BY tc.display_order ASC, tc.name ASC
    `
    const normalized = (rows as unknown as TaskCatalogAdlRow[])
      .map((r) => {
        const cat = firstCategory(r.task_categories)
        return {
          name: (r.name ?? '').trim(),
          group: (cat?.name ?? '').trim() || 'General',
        }
      })
      .filter((r) => r.name.length > 0)
    return { data: normalized, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getTaskCatalogSkilledTasks(): Promise<{
  data: Array<{ id: string; code: string; name: string; category: string; description: string | null }> | null
  error: Error | null
}> {
  try {
    const rows = await sql`
      SELECT tc.id, tc.code, tc.name, tc.description,
             json_build_object('name', tcat.name, 'service_type', tcat.service_type) AS task_categories
      FROM task_catalog tc
      INNER JOIN task_categories tcat ON tcat.id = tc.category_id
      WHERE tc.is_active = true
        AND tcat.service_type = 'skilled'
      ORDER BY tc.display_order ASC, tc.name ASC
    `
    const normalized = (rows as unknown as TaskCatalogSkilledRow[])
      .map((r) => {
        const cat = firstCategory(r.task_categories)
        return {
          id: (r.id ?? '').trim(),
          code: (r.code ?? '').trim(),
          name: (r.name ?? '').trim(),
          category: (cat?.name ?? '').trim() || 'General',
          description: r.description ?? null,
        }
      })
      .filter((r) => r.id.length > 0 && r.name.length > 0)
    return { data: normalized, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
