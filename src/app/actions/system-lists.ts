'use server'

import sql from '@/db'
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
type TaskCatalogItem = { id: string; name: string; categoryId: string; categoryName: string }

async function ensureDefaultTaskCategory(serviceType: ServiceType) {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM task_categories WHERE service_type = ${serviceType} AND name = 'General' LIMIT 1
  `
  if (existing) return { error: null, id: existing.id }

  try {
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO task_categories (name, service_type, display_order)
      VALUES ('General', ${serviceType}, 0)
      RETURNING id
    `
    if (!inserted) return { error: 'Insert failed', id: null as string | null }
    return { error: null, id: inserted.id }
  } catch (err: any) {
    return { error: err.message, id: null as string | null }
  }
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
  const [row] = await sql<{
    id: string
    name: string
    category_id: string
    category_name: string
  }[]>`
    SELECT tc.id, tc.name, tc.category_id, tcat.name AS category_name
    FROM task_catalog tc
    JOIN task_categories tcat ON tcat.id = tc.category_id
    WHERE tc.id = ${id}
    LIMIT 1
  `
  if (!row) return { error: 'Task not found', data: null }
  return {
    error: null,
    data: {
      id: row.id,
      name: String(row.name ?? '').trim(),
      categoryId: row.category_id,
      categoryName: String(row.category_name ?? '').trim() || 'General',
    } satisfies TaskCatalogItem,
  }
}

export async function createTaskCatalogItem(serviceType: ServiceType, name: string, categoryId?: string | null) {
  try {
    const trimmedName = name.trim()
    if (!trimmedName) return { error: 'Task name is required.', data: null }

    let resolvedCategoryId = (categoryId ?? '').trim()
    if (!resolvedCategoryId) {
      const category = await ensureDefaultTaskCategory(serviceType)
      if (category.error || !category.id) return { error: category.error || 'Could not resolve task category.', data: null }
      resolvedCategoryId = category.id
    }

    const [data] = await sql<{ id: string }[]>`
      INSERT INTO task_catalog (code, name, category_id, is_skilled)
      VALUES (
        ${taskCodeFromName(trimmedName, serviceType)},
        ${trimmedName},
        ${resolvedCategoryId},
        ${serviceType === 'skilled'}
      )
      RETURNING id
    `
    if (!data) return { error: 'Insert failed', data: null }

    const item = await getTaskCatalogItemById(data.id)
    if (item.error || !item.data) return { error: item.error || 'Task created but could not be loaded.', data: null }
    revalidatePath('/pages/admin/configuration')
    revalidateTaskCatalogCaches()
    return { error: null, data: item.data }
  } catch (err: any) {
    return { error: err.message || 'Failed to create task', data: null }
  }
}

export async function updateTaskCatalogItem(id: string, name: string) {
  try {
    const trimmedName = name.trim()
    if (!trimmedName) return { error: 'Task name is required.', data: null }

    const [data] = await sql<{ id: string }[]>`
      UPDATE task_catalog SET name = ${trimmedName} WHERE id = ${id} RETURNING id
    `
    if (!data) return { error: 'Task not found', data: null }

    const item = await getTaskCatalogItemById(data.id)
    if (item.error || !item.data) return { error: item.error || 'Task updated but could not be loaded.', data: null }
    revalidatePath('/pages/admin/configuration')
    revalidateTaskCatalogCaches()
    return { error: null, data: item.data }
  } catch (err: any) {
    return { error: err.message || 'Failed to update task', data: null }
  }
}

export async function deleteTaskCatalogItem(id: string) {
  try {
    await sql`DELETE FROM task_catalog WHERE id = ${id}`
    revalidatePath('/pages/admin/configuration')
    revalidateTaskCatalogCaches()
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete task' }
  }
}
