import type { Supabase } from '../types'

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
export async function getConfigurationValuesWithSubcategories(
  supabase: Supabase,
  typeCode: string
) {
  const typeResult = await supabase
    .from('configuration_types')
    .select('id')
    .eq('code', typeCode)
    .single()

  if (typeResult.error || !typeResult.data) {
    return { data: null, error: new Error(`Configuration type '${typeCode}' not found`) }
  }

  const typeId = typeResult.data.id

  const { data: rows, error } = await supabase
    .from('configuration_values')
    .select('id, type_id, parent_id, code, name, description, is_active, sort_order, created_at, updated_at')
    .eq('type_id', typeId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return { data: null, error: new Error(error.message) }

  const all = (rows ?? []) as ConfigurationValue[]
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
    data: tops.map(t => ({ ...t, subcategories: childMap.get(t.id) ?? [] })) as ConfigurationValueWithSubcategories[],
    error: null,
  }
}

/** Count all references to a given configuration_value id:
 *  children (subcategories), playbooks, applications, and licenses. */
export async function getConfigurationValueReferenceCount(supabase: Supabase, valueId: string) {
  const [children, playbooksCat, playbooksSub, appsCat, appsSub, licCat, licSub] = await Promise.all([
    supabase.from('configuration_values').select('id', { count: 'exact', head: true }).eq('parent_id', valueId),
    supabase.from('playbooks').select('id', { count: 'exact', head: true }).eq('category_id', valueId),
    supabase.from('playbooks').select('id', { count: 'exact', head: true }).eq('subcategory_id', valueId),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('category_id', valueId),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('subcategory_id', valueId),
    supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('category_id', valueId),
    supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('subcategory_id', valueId),
  ])
  return {
    childCount:       children.count ?? 0,
    playbookCount:    (playbooksCat.count ?? 0) + (playbooksSub.count ?? 0),
    applicationCount: (appsCat.count ?? 0) + (appsSub.count ?? 0),
    licenseCount:     (licCat.count ?? 0) + (licSub.count ?? 0),
  }
}

export async function insertConfigurationValue(
  supabase: Supabase,
  data: {
    type_id: string
    parent_id?: string | null
    name: string
    description?: string | null
    sort_order?: number
    created_by?: string | null
  }
) {
  return supabase
    .from('configuration_values')
    .insert({ ...data, parent_id: data.parent_id ?? null, updated_at: new Date().toISOString() })
    .select('id, type_id, parent_id, code, name, description, is_active, sort_order, created_at, updated_at')
    .single()
}

export async function updateConfigurationValue(
  supabase: Supabase,
  id: string,
  data: Partial<{ name: string; description: string | null; is_active: boolean; sort_order: number }>
) {
  return supabase
    .from('configuration_values')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, type_id, parent_id, code, name, description, is_active, sort_order, created_at, updated_at')
    .single()
}

export async function deleteConfigurationValue(supabase: Supabase, id: string) {
  return supabase.from('configuration_values').delete().eq('id', id)
}
