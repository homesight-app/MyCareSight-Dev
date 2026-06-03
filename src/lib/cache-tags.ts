/** Use with `unstable_cache` `tags` and `revalidateTag` from `next/cache`. */

export const CACHE_TAG_AGENCY_CLIENT_DETAIL = 'agency-client-detail'
export const CACHE_TAG_AGENCY_MESSAGES_INBOX = 'agency-messages-inbox'
export const CACHE_TAG_CAREGIVER_VISIT_EXECUTION = 'caregiver-visit-execution'

/** Reference data: `certification_types` table */
export const CACHE_TAG_CERTIFICATION_TYPES = 'certification-types'

/** Reference data: `caregiver_roles` */
export const CACHE_TAG_CAREGIVER_ROLES = 'caregiver-roles'

/** Task catalog / categories (admin configuration) */
export const CACHE_TAG_TASK_CATALOG_SKILLED = 'task-catalog-skilled'
export const CACHE_TAG_TASK_CATALOG_NON_SKILLED = 'task-catalog-non-skilled'
export const CACHE_TAG_TASK_CATEGORIES_SKILLED = 'task-categories-skilled'
export const CACHE_TAG_TASK_CATEGORIES_NON_SKILLED = 'task-categories-non-skilled'

/** `agencies` list reads (id+name, full order, billing slice) */
export const CACHE_TAG_AGENCIES_ID_NAME = 'agencies-id-name'
export const CACHE_TAG_AGENCIES_ORDERED = 'agencies-ordered'
export const CACHE_TAG_AGENCIES_FOR_BILLING = 'agencies-for-billing'

/** Caregiver skill catalog built from `task_required_credentials` */
export const CACHE_TAG_CAREGIVER_SKILL_CATALOG = 'caregiver-skill-catalog'

/** Active rows from `license_types` */
export const CACHE_TAG_LICENSE_TYPES_ACTIVE = 'license-types-active'

export function caregiverVisitExecutionTag(visitId: string) {
  return `${CACHE_TAG_CAREGIVER_VISIT_EXECUTION}:${visitId}`
}
