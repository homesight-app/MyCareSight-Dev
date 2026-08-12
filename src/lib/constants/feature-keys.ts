export const AGENCY_FEATURES = [
  // Section-level keys — gate the entire nav item and page route
  { key: 'home',               label: 'Home',             path: '/pages/agency',               parentKey: null },
  { key: 'licenses',           label: 'Licenses',         path: '/pages/agency/licenses',      parentKey: null },
  { key: 'certifications',     label: 'Certifications',   path: '/pages/agency/certifications',parentKey: null },
  { key: 'programs',           label: 'Programs',         path: '/pages/agency/programs',      parentKey: null },
  { key: 'clients',            label: 'Clients',          path: '/pages/agency/clients',       parentKey: null },
  { key: 'caregivers',         label: 'Caregivers',       path: '/pages/agency/caregiver',     parentKey: null },
  { key: 'care_visits',        label: 'Care Visits',      path: '/pages/agency/care-visits',   parentKey: null },
  { key: 'time_billing',       label: 'Time & Billing',   path: '/pages/agency/time-billing',  parentKey: null },
  { key: 'leads',              label: 'Leads',            path: '/pages/agency/leads',         parentKey: null },
  { key: 'templates',          label: 'Templates',        path: '/pages/agency/templates',     parentKey: null },
  { key: 'reports',            label: 'Reports',          path: '/pages/agency/reports',       parentKey: null },
  { key: 'configuration',      label: 'Configuration',    path: '/pages/agency/configuration', parentKey: null },
  // Sub-feature keys — gate specific tabs/capabilities within a section
  { key: 'clients_scheduling', label: 'Client Scheduling',path: '/pages/agency/clients',       parentKey: 'clients' },
] as const

export type AgencyFeature = typeof AGENCY_FEATURES[number]
export type FeatureKey = AgencyFeature['key']

/** Returns the parent key for a given feature key, or null if it is a section-level key. */
export function getParentKey(key: string): string | null {
  const found = AGENCY_FEATURES.find(f => f.key === key)
  return (found as { parentKey: string | null } | undefined)?.parentKey ?? null
}

/** Given a set of selected feature keys, returns them with any missing parent keys auto-added. */
export function withImpliedParents(keys: string[]): string[] {
  const set = new Set(keys)
  for (const key of keys) {
    const parent = getParentKey(key)
    if (parent) set.add(parent)
  }
  return Array.from(set)
}
