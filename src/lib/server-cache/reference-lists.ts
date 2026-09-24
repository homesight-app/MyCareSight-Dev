import { unstable_cache } from 'next/cache'
import sql from '@/db'
import * as q from '@/lib/supabase/query'
import {
  CACHE_TAG_AGENCIES_FOR_BILLING,
  CACHE_TAG_AGENCIES_ID_NAME,
  CACHE_TAG_AGENCIES_ORDERED,
  CACHE_TAG_LICENSE_TYPES_ACTIVE,
  CACHE_TAG_TASK_CATALOG_NON_SKILLED,
  CACHE_TAG_TASK_CATALOG_SKILLED,
  CACHE_TAG_TASK_CATEGORIES_NON_SKILLED,
  CACHE_TAG_TASK_CATEGORIES_SKILLED,
} from '@/lib/cache-tags'

type ServiceType = 'skilled' | 'non_skilled'
type TaskCategoryItem = { id: string; name: string }
type TaskCatalogItem = { id: string; name: string; categoryId: string; categoryName: string }

const getAgenciesIdNameCached = unstable_cache(
  async () => {
    return q.getAgenciesIdName()
  },
  ['ref-agencies-id-name'],
  { revalidate: 120, tags: [CACHE_TAG_AGENCIES_ID_NAME] }
)

const getAgenciesOrderedCached = unstable_cache(
  async () => {
    return q.getAgenciesOrdered()
  },
  ['ref-agencies-ordered'],
  { revalidate: 120, tags: [CACHE_TAG_AGENCIES_ORDERED] }
)

const getAgenciesForBillingCached = unstable_cache(
  async () => {
    return q.getAgenciesForBilling()
  },
  ['ref-agencies-billing'],
  { revalidate: 120, tags: [CACHE_TAG_AGENCIES_FOR_BILLING] }
)

type TaskWithCategoryRow = {
  id: string
  name: string
  category_id: string
  tcat_id: string
  tcat_name: string
}

async function fetchTasksByServiceType(serviceType: ServiceType): Promise<{
  error: string | null
  data: TaskCatalogItem[] | null
}> {
  try {
    const rows = await sql<TaskWithCategoryRow[]>`
      SELECT tc.id, tc.name, tc.category_id, tcat.id AS tcat_id, tcat.name AS tcat_name
      FROM task_catalog tc
      INNER JOIN task_categories tcat ON tcat.id = tc.category_id
      WHERE tcat.service_type = ${serviceType}
        AND tc.is_active = true
      ORDER BY tc.display_order ASC, tc.name ASC
    `
    const normalized = rows
      .map((row) => ({
        id: String(row.id),
        name: String(row.name ?? '').trim(),
        categoryId: String(row.category_id ?? row.tcat_id ?? ''),
        categoryName: String(row.tcat_name ?? '').trim() || 'General',
      } satisfies TaskCatalogItem))
      .filter((row) => row.id && row.name)
    return { error: null, data: normalized }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch tasks', data: null }
  }
}

async function fetchTaskCategoriesByServiceType(serviceType: ServiceType): Promise<{
  error: string | null
  data: TaskCategoryItem[] | null
}> {
  try {
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT id, name
      FROM task_categories
      WHERE service_type = ${serviceType}
      ORDER BY display_order ASC, name ASC
    `
    const normalized = rows
      .map((row) => ({
        id: String(row.id),
        name: String(row.name ?? '').trim(),
      }))
      .filter((row) => row.id && row.name)
    return { error: null, data: normalized }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch task categories', data: null }
  }
}

const getSkilledTasksCached = unstable_cache(
  async () => {
    return fetchTasksByServiceType('skilled')
  },
  ['ref-task-catalog-skilled'],
  { revalidate: 180, tags: [CACHE_TAG_TASK_CATALOG_SKILLED] }
)

const getNonSkilledTasksCached = unstable_cache(
  async () => {
    return fetchTasksByServiceType('non_skilled')
  },
  ['ref-task-catalog-non-skilled'],
  { revalidate: 180, tags: [CACHE_TAG_TASK_CATALOG_NON_SKILLED] }
)

const getSkilledTaskCategoriesCached = unstable_cache(
  async () => {
    return fetchTaskCategoriesByServiceType('skilled')
  },
  ['ref-task-categories-skilled'],
  { revalidate: 180, tags: [CACHE_TAG_TASK_CATEGORIES_SKILLED] }
)

const getNonSkilledTaskCategoriesCached = unstable_cache(
  async () => {
    return fetchTaskCategoriesByServiceType('non_skilled')
  },
  ['ref-task-categories-non-skilled'],
  { revalidate: 180, tags: [CACHE_TAG_TASK_CATEGORIES_NON_SKILLED] }
)

const CONFIG_LICENSE_TYPES_SELECT =
  'id, name, state, renewal_period_display, cost_display, service_fee_display, processing_time_display'

const getLicenseTypesActiveConfigCached = unstable_cache(
  async () => {
    return q.getLicenseTypesActive(CONFIG_LICENSE_TYPES_SELECT)
  },
  ['ref-license-types-active', CONFIG_LICENSE_TYPES_SELECT],
  { revalidate: 300, tags: [CACHE_TAG_LICENSE_TYPES_ACTIVE] }
)

const getLicenseTypesActiveBillingCached = unstable_cache(
  async () => {
    return q.getLicenseTypesActive()
  },
  ['ref-license-types-active-billing'],
  { revalidate: 300, tags: [CACHE_TAG_LICENSE_TYPES_ACTIVE] }
)

export function getCachedAgenciesIdName() {
  return getAgenciesIdNameCached()
}

export function getCachedAgenciesOrdered() {
  return getAgenciesOrderedCached()
}

export function getCachedAgenciesForBilling() {
  return getAgenciesForBillingCached()
}

export function getCachedSkilledTasks() {
  return getSkilledTasksCached()
}

export function getCachedNonSkilledTasks() {
  return getNonSkilledTasksCached()
}

export function getCachedSkilledTaskCategories() {
  return getSkilledTaskCategoriesCached()
}

export function getCachedNonSkilledTaskCategories() {
  return getNonSkilledTaskCategoriesCached()
}

export function getCachedLicenseTypesForConfiguration() {
  return getLicenseTypesActiveConfigCached()
}

export function getCachedLicenseTypesForBilling() {
  return getLicenseTypesActiveBillingCached()
}

export function getCachedCaregiverSkillCatalog() {
  // Compatibility name: authenticate each request; never cache an authorization result.
  return q.getCaregiverSkillCatalogFromTaskRequirements()
}
