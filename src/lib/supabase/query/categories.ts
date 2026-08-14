import type { Supabase } from '../types'

export interface PlaybookCategory {
  id: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PlaybookSubcategory {
  id: string
  category_id: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PlaybookCategoryWithSubs extends PlaybookCategory {
  subcategories: PlaybookSubcategory[]
}

export async function getPlaybookCategories(supabase: Supabase) {
  return supabase
    .from('playbook_categories')
    .select('id, name, description, is_active, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
}

export async function getPlaybookCategoriesWithSubcategories(supabase: Supabase) {
  return supabase
    .from('playbook_categories')
    .select(`
      id, name, description, is_active, sort_order, created_at, updated_at,
      subcategories:playbook_subcategories(id, category_id, name, description, is_active, sort_order, created_at, updated_at)
    `)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
}

export async function getCategoryReferenceCount(supabase: Supabase, categoryId: string) {
  const [subcats, playbooks, applications, licenses] = await Promise.all([
    supabase.from('playbook_subcategories').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
    supabase.from('playbooks').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
    supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
  ])
  return {
    subcategoryCount:  subcats.count ?? 0,
    playbookCount:     playbooks.count ?? 0,
    applicationCount:  applications.count ?? 0,
    licenseCount:      licenses.count ?? 0,
  }
}

export async function getSubcategoryReferenceCount(supabase: Supabase, subcategoryId: string) {
  const [playbooks, applications, licenses] = await Promise.all([
    supabase.from('playbooks').select('id', { count: 'exact', head: true }).eq('subcategory_id', subcategoryId),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('subcategory_id', subcategoryId),
    supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('subcategory_id', subcategoryId),
  ])
  return {
    playbookCount:    playbooks.count ?? 0,
    applicationCount: applications.count ?? 0,
    licenseCount:     licenses.count ?? 0,
  }
}

export async function insertPlaybookCategory(
  supabase: Supabase,
  data: { name: string; description?: string | null; sort_order?: number; created_by?: string | null }
) {
  return supabase
    .from('playbook_categories')
    .insert({ ...data, updated_at: new Date().toISOString() })
    .select('id, name, description, is_active, sort_order, created_at, updated_at')
    .single()
}

export async function updatePlaybookCategory(
  supabase: Supabase,
  id: string,
  data: Partial<{ name: string; description: string | null; is_active: boolean; sort_order: number }>
) {
  return supabase
    .from('playbook_categories')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, description, is_active, sort_order, created_at, updated_at')
    .single()
}

export async function deletePlaybookCategory(supabase: Supabase, id: string) {
  return supabase.from('playbook_categories').delete().eq('id', id)
}

export async function insertPlaybookSubcategory(
  supabase: Supabase,
  data: { category_id: string; name: string; description?: string | null; sort_order?: number; created_by?: string | null }
) {
  return supabase
    .from('playbook_subcategories')
    .insert({ ...data, updated_at: new Date().toISOString() })
    .select('id, category_id, name, description, is_active, sort_order, created_at, updated_at')
    .single()
}

export async function updatePlaybookSubcategory(
  supabase: Supabase,
  id: string,
  data: Partial<{ name: string; description: string | null; is_active: boolean; sort_order: number }>
) {
  return supabase
    .from('playbook_subcategories')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, category_id, name, description, is_active, sort_order, created_at, updated_at')
    .single()
}

export async function deletePlaybookSubcategory(supabase: Supabase, id: string) {
  return supabase.from('playbook_subcategories').delete().eq('id', id)
}
