'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import {
  CACHE_TAG_CAREGIVER_SKILL_CATALOG,
  CACHE_TAG_TASK_CATALOG_NON_SKILLED,
  CACHE_TAG_TASK_CATALOG_SKILLED,
  CACHE_TAG_TASK_CATEGORIES_NON_SKILLED,
  CACHE_TAG_TASK_CATEGORIES_SKILLED,
} from '@/lib/cache-tags'
import {
  getCachedNonSkilledTaskCategories,
  getCachedNonSkilledTasks,
  getCachedSkilledTaskCategories,
  getCachedSkilledTasks,
} from '@/lib/server-cache/reference-lists'

type ServiceType = 'skilled' | 'non_skilled'
type TaskCategoryItem = { id: string; name: string }
type TaskCatalogItem = { id: string; name: string; categoryId: string; categoryName: string }

async function ensureDefaultTaskCategory(supabase: Awaited<ReturnType<typeof createClient>>, serviceType: ServiceType) {
  const { data: existing, error: readErr } = await supabase
    .from('task_categories')
    .select('id')
    .eq('service_type', serviceType)
    .eq('name', 'General')
    .limit(1)
    .maybeSingle()

  if (readErr) return { error: readErr.message, id: null as string | null }
  if (existing?.id) return { error: null, id: existing.id as string }

  const { data: inserted, error: insertErr } = await supabase
    .from('task_categories')
    .insert({ name: 'General', service_type: serviceType, display_order: 0 })
    .select('id')
    .single()

  if (insertErr) return { error: insertErr.message, id: null as string | null }
  return { error: null, id: inserted.id as string }
}

function taskCodeFromName(name: string, serviceType: ServiceType): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36)
  const suffix = Date.now().toString(36)
  return `${serviceType}_${normalized || 'task'}_${suffix}`
}

function revalidateTaskCatalogCaches() {
  revalidateTag(CACHE_TAG_TASK_CATALOG_SKILLED)
  revalidateTag(CACHE_TAG_TASK_CATALOG_NON_SKILLED)
  revalidateTag(CACHE_TAG_TASK_CATEGORIES_SKILLED)
  revalidateTag(CACHE_TAG_TASK_CATEGORIES_NON_SKILLED)
  revalidateTag(CACHE_TAG_CAREGIVER_SKILL_CATALOG)
}

export async function getSkilledTasks() {
  return getCachedSkilledTasks()
}

export async function getNonSkilledTasks() {
  return getCachedNonSkilledTasks()
}

export async function getSkilledTaskCategories() {
  return getCachedSkilledTaskCategories()
}

export async function getNonSkilledTaskCategories() {
  return getCachedNonSkilledTaskCategories()
}

async function getTaskCatalogItemById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_catalog')
    .select('id, name, category_id, task_categories!inner(name)')
    .eq('id', id)
    .single()

  if (error) return { error: error.message, data: null }

  const category = Array.isArray(data.task_categories)
    ? data.task_categories[0]
    : data.task_categories
  return {
    error: null,
    data: {
      id: String(data.id),
      name: String(data.name ?? '').trim(),
      categoryId: String(data.category_id ?? ''),
      categoryName: String(category?.name ?? '').trim() || 'General',
    } satisfies TaskCatalogItem,
  }
}

export async function createTaskCatalogItem(serviceType: ServiceType, name: string, categoryId?: string | null) {
  const supabase = await createClient()
  try {
    const trimmedName = name.trim()
    if (!trimmedName) return { error: 'Task name is required.', data: null }

    let resolvedCategoryId = (categoryId ?? '').trim()
    if (!resolvedCategoryId) {
      const category = await ensureDefaultTaskCategory(supabase, serviceType)
      if (category.error || !category.id) return { error: category.error || 'Could not resolve task category.', data: null }
      resolvedCategoryId = category.id
    }

    const { data, error } = await supabase
      .from('task_catalog')
      .insert({
        code: taskCodeFromName(trimmedName, serviceType),
        name: trimmedName,
        category_id: resolvedCategoryId,
        is_skilled: serviceType === 'skilled',
      })
      .select('id')
      .single()

    if (error) return { error: error.message, data: null }
    const item = await getTaskCatalogItemById(String(data.id))
    if (item.error || !item.data) return { error: item.error || 'Task created but could not be loaded.', data: null }
    revalidatePath('/pages/admin/configuration')
    revalidateTaskCatalogCaches()
    return { error: null, data: item.data }
  } catch (err: any) {
    return { error: err.message || 'Failed to create task', data: null }
  }
}

export async function updateTaskCatalogItem(id: string, name: string) {
  const supabase = await createClient()
  try {
    const trimmedName = name.trim()
    if (!trimmedName) return { error: 'Task name is required.', data: null }

    const { data, error } = await supabase
      .from('task_catalog')
      .update({ name: trimmedName })
      .eq('id', id)
      .select('id')
      .single()

    if (error) return { error: error.message, data: null }
    const item = await getTaskCatalogItemById(String(data.id))
    if (item.error || !item.data) return { error: item.error || 'Task updated but could not be loaded.', data: null }
    revalidatePath('/pages/admin/configuration')
    revalidateTaskCatalogCaches()
    return { error: null, data: item.data }
  } catch (err: any) {
    return { error: err.message || 'Failed to update task', data: null }
  }
}

export async function deleteTaskCatalogItem(id: string) {
  const supabase = await createClient()
  try {
    const { error } = await supabase.from('task_catalog').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/pages/admin/configuration')
    revalidateTaskCatalogCaches()
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete task' }
  }
}
