import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import {
  CACHE_TAG_AGENCIES_FOR_BILLING,
  CACHE_TAG_AGENCIES_ID_NAME,
  CACHE_TAG_AGENCIES_ORDERED,
  CACHE_TAG_CAREGIVER_SKILL_CATALOG,
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
    const supabase = createAdminClient()
    return q.getAgenciesIdName(supabase)
  },
  ['ref-agencies-id-name'],
  { revalidate: 120, tags: [CACHE_TAG_AGENCIES_ID_NAME] }
)

const getAgenciesOrderedCached = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    return q.getAgenciesOrdered(supabase)
  },
  ['ref-agencies-ordered'],
  { revalidate: 120, tags: [CACHE_TAG_AGENCIES_ORDERED] }
)

const getAgenciesForBillingCached = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    return q.getAgenciesForBilling(supabase)
  },
  ['ref-agencies-billing'],
  { revalidate: 120, tags: [CACHE_TAG_AGENCIES_FOR_BILLING] }
)

async function fetchTasksByServiceType(serviceType: ServiceType): Promise<{
  error: string | null
  data: TaskCatalogItem[] | null
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('task_catalog')
    .select('id, name, category_id, task_categories!inner(id, name, service_type)')
    .eq('task_categories.service_type', serviceType)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return { error: error.message, data: null }
  const normalized = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const category = Array.isArray(row.task_categories) ? row.task_categories[0] : row.task_categories
      const cat = category as { id?: string; name?: string } | null
      return {
        id: String(row.id),
        name: String(row.name ?? '').trim(),
        categoryId: String(row.category_id ?? cat?.id ?? ''),
        categoryName: String(cat?.name ?? '').trim() || 'General',
      } satisfies TaskCatalogItem
    })
    .filter((row) => row.id && row.name)

  return { error: null, data: normalized }
}

async function fetchTaskCategoriesByServiceType(serviceType: ServiceType): Promise<{
  error: string | null
  data: TaskCategoryItem[] | null
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('task_categories')
    .select('id, name')
    .eq('service_type', serviceType)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return { error: error.message, data: null }
  const normalized = (data ?? [])
    .map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name ?? '').trim(),
    }))
    .filter((row) => row.id && row.name)

  return { error: null, data: normalized }
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
    const supabase = createAdminClient()
    return q.getLicenseTypesActive(supabase, CONFIG_LICENSE_TYPES_SELECT)
  },
  ['ref-license-types-active', CONFIG_LICENSE_TYPES_SELECT],
  { revalidate: 300, tags: [CACHE_TAG_LICENSE_TYPES_ACTIVE] }
)

const getLicenseTypesActiveBillingCached = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    return q.getLicenseTypesActive(supabase)
  },
  ['ref-license-types-active-billing'],
  { revalidate: 300, tags: [CACHE_TAG_LICENSE_TYPES_ACTIVE] }
)

const getCaregiverSkillCatalogCached = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    return q.getCaregiverSkillCatalogFromTaskRequirements(supabase)
  },
  ['ref-caregiver-skill-catalog'],
  { revalidate: 180, tags: [CACHE_TAG_CAREGIVER_SKILL_CATALOG] }
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
  return getCaregiverSkillCatalogCached()
}
