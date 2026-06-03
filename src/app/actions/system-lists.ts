'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import {
  CACHE_TAG_CAREGIVER_ROLES,
  CACHE_TAG_CAREGIVER_SKILL_CATALOG,
  CACHE_TAG_CERTIFICATION_TYPES,
  CACHE_TAG_TASK_CATALOG_NON_SKILLED,
  CACHE_TAG_TASK_CATALOG_SKILLED,
  CACHE_TAG_TASK_CATEGORIES_NON_SKILLED,
  CACHE_TAG_TASK_CATEGORIES_SKILLED,
} from '@/lib/cache-tags'
import {
  getCachedCertificationTypes,
  getCachedNonSkilledTaskCategories,
  getCachedNonSkilledTasks,
  getCachedSkilledTaskCategories,
  getCachedSkilledTasks,
  getCachedStaffRoles,
} from '@/lib/server-cache/reference-lists'

type ServiceType = 'skilled' | 'non_skilled'
type TaskCategoryItem = { id: string; name: string }
type TaskCatalogItem = { id: string; name: string; categoryId: string; categoryName: string }

// Certification Types Actions
export async function getCertificationTypes() {
  try {
    return await getCachedCertificationTypes()
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch certification types', data: null }
  }
}

export async function createCertificationType(certificationType: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('certification_types')
      .insert({ certification_type: certificationType })
      .select()
      .single()

    if (error) {
      return { error: error.message, data: null }
    }

    revalidatePath('/pages/admin/configuration')
    revalidateTag(CACHE_TAG_CERTIFICATION_TYPES)
    return { error: null, data }
  } catch (err: any) {
    return { error: err.message || 'Failed to create certification type', data: null }
  }
}

export async function updateCertificationType(id: number, certificationType: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('certification_types')
      .update({ certification_type: certificationType })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return { error: error.message, data: null }
    }

    revalidatePath('/pages/admin/configuration')
    revalidateTag(CACHE_TAG_CERTIFICATION_TYPES)
    return { error: null, data }
  } catch (err: any) {
    return { error: err.message || 'Failed to update certification type', data: null }
  }
}

export async function deleteCertificationType(id: number) {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('certification_types')
      .delete()
      .eq('id', id)

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/pages/admin/configuration')
    revalidateTag(CACHE_TAG_CERTIFICATION_TYPES)
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete certification type' }
  }
}


// Staff Roles Actions (UI only for now - table exists but actions not implemented)
export async function getStaffRoles() {
  try {
    return await getCachedStaffRoles()
  } catch {
    return { error: null, data: [] }
  }
}

export async function createStaffRole(name: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('caregiver_roles')
      .insert({ name })
      .select()
      .single()

    if (error) {
      return { error: error.message, data: null }
    }

    revalidatePath('/pages/admin/configuration')
    revalidateTag(CACHE_TAG_CAREGIVER_ROLES)
    return { error: null, data }
  } catch (err: any) {
    return { error: err.message || 'Failed to create staff role', data: null }
  }
}

export async function updateStaffRole(id: number, name: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('caregiver_roles')
      .update({ name })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return { error: error.message, data: null }
    }
    
    revalidatePath('/pages/admin/configuration')
    revalidateTag(CACHE_TAG_CAREGIVER_ROLES)
    return { error: null, data }
  } catch (err: any) {
    return { error: err.message || 'Failed to update staff role', data: null }
  }
}

export async function deleteStaffRole(id: number) {
  const supabase = await createClient() 

  try {
    const { error } = await supabase
      .from('caregiver_roles')
      .delete()
      .eq('id', id)

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/pages/admin/configuration')
    revalidateTag(CACHE_TAG_CAREGIVER_ROLES)
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete staff role' }
  }
}

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
