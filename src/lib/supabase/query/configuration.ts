import sql from '@/db'

export interface ConfigurationValue {
  id: string
  type_id: string
  parent_id: string | null
  code: string | null
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ConfigurationValueWithSubcategories extends ConfigurationValue {
  subcategories: ConfigurationValue[]
}

export interface ConfigurationType {
  id: string
  code: string
  name: string
  description: string | null
  supports_hierarchy: boolean
  is_admin_manageable: boolean
  is_active: boolean
}

/** Fetch all configuration_values for a given type code, grouped into
 *  top-level values with their children nested under `subcategories`. */
export async function getConfigurationValuesWithSubcategories(typeCode: string) {
  try {
    const typeRows = await sql`SELECT id FROM configuration_types WHERE code = ${typeCode}`
    if (!typeRows[0]) {
      return { data: null, error: new Error(`Configuration type '${typeCode}' not found`) }
    }
    const typeId = (typeRows[0] as any).id

    const rows = await sql`
      SELECT id, type_id, parent_id, code, name, description, is_active, sort_order, created_at, updated_at
      FROM configuration_values
      WHERE type_id = ${typeId}
      ORDER BY sort_order ASC, name ASC
    `

    const all = (rows ?? []) as unknown as ConfigurationValue[]
    const tops = all.filter(v => v.parent_id === null)
    const childMap = new Map<string, ConfigurationValue[]>()
    for (const v of all) {
      if (v.parent_id) {
        const list = childMap.get(v.parent_id) ?? []
        list.push(v)
        childMap.set(v.parent_id, list)
      }
    }

    return {
      data: tops.map(t => ({ ...t, subcategories: childMap.get(t.id) ?? [] })) as unknown as ConfigurationValueWithSubcategories[],
      error: null,
    }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/** Count all references to a given configuration_value id:
 *  children (subcategories), playbooks, applications, and licenses. */
export async function getConfigurationValueReferenceCount(valueId: string) {
  try {
    const [
      childrenRows,
      playbooksCatRows,
      playbooksSubRows,
      appsCatRows,
      appsSubRows,
      licCatRows,
      licSubRows,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM configuration_values WHERE parent_id = ${valueId}`,
      sql`SELECT COUNT(*)::int AS count FROM playbooks WHERE category_id = ${valueId}`,
      sql`SELECT COUNT(*)::int AS count FROM playbooks WHERE subcategory_id = ${valueId}`,
      sql`SELECT COUNT(*)::int AS count FROM applications WHERE category_id = ${valueId}`,
      sql`SELECT COUNT(*)::int AS count FROM applications WHERE subcategory_id = ${valueId}`,
      sql`SELECT COUNT(*)::int AS count FROM licenses WHERE category_id = ${valueId}`,
      sql`SELECT COUNT(*)::int AS count FROM licenses WHERE subcategory_id = ${valueId}`,
    ])

    const c = (r: typeof childrenRows) => (r[0] as { count: number } | undefined)?.count ?? 0

    return {
      childCount:       c(childrenRows),
      playbookCount:    c(playbooksCatRows) + c(playbooksSubRows),
      applicationCount: c(appsCatRows) + c(appsSubRows),
      licenseCount:     c(licCatRows) + c(licSubRows),
    }
  } catch {
    return { childCount: 0, playbookCount: 0, applicationCount: 0, licenseCount: 0 }
  }
}

export async function insertConfigurationValue(
  data: {
    type_id: string
    parent_id?: string | null
    name: string
    description?: string | null
    sort_order?: number
    created_by?: string | null
  }
) {
  try {
    const payload = { ...data, parent_id: data.parent_id ?? null, updated_at: new Date().toISOString() }
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    const rows = await sql`
      INSERT INTO configuration_values ${sql(payload, ...keys)}
      RETURNING id, type_id, parent_id, code, name, description, is_active, sort_order, created_at, updated_at
    `
    if (!rows[0]) throw new Error('Row not found')
    return { data: rows[0] as ConfigurationValue, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateConfigurationValue(
  id: string,
  data: Partial<{ name: string; description: string | null; is_active: boolean; sort_order: number }>
) {
  try {
    const payload = { ...data, updated_at: new Date().toISOString() }
    const keys = Object.keys(payload) as (keyof typeof payload)[]
    const rows = await sql`
      UPDATE configuration_values SET ${sql(payload, ...keys)} WHERE id = ${id}
      RETURNING id, type_id, parent_id, code, name, description, is_active, sort_order, created_at, updated_at
    `
    if (!rows[0]) throw new Error('Row not found')
    return { data: rows[0] as ConfigurationValue, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function deleteConfigurationValue(id: string) {
  try {
    await sql`DELETE FROM configuration_values WHERE id = ${id}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
