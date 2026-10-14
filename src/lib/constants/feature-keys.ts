export const AGENCY_CAPABILITIES = [
  {
    key: 'client_management',
    label: 'Client Management',
    description: 'Manage leads, clients, and client records.',
    includes: ['Leads', 'Clients'],
  },
  {
    key: 'care_operations',
    label: 'Care Operations',
    description: 'Run the complete visit workflow as one entitlement.',
    includes: [
      'Client scheduling',
      'Create and manage shifts',
      'Match, advertise, and assign caregivers',
      'Caregiver visit execution',
      'Pay and bill rates, time tracking, approvals, billing, and payroll preparation',
    ],
  },
  {
    key: 'caregiver_management',
    label: 'Caregiver Management',
    description: 'Create and manage caregiver accounts and profiles.',
    includes: ['Caregiver accounts', 'Caregiver profiles'],
  },
  {
    key: 'agency_compliance',
    label: 'Agency Compliance',
    description: 'Manage agency certification and compliance records.',
    includes: ['Certifications'],
  },
  {
    key: 'analytics_reporting',
    label: 'Analytics & Reporting',
    description: 'View operational reports and exports.',
    includes: ['Reports'],
  },
  {
    key: 'homesights_services',
    label: 'HomeSights Services',
    description: 'Access HomeSights services and reusable templates.',
    includes: ['My Services', 'Templates'],
  },
] as const

export type AgencyCapability = typeof AGENCY_CAPABILITIES[number]
export type CapabilityKey = AgencyCapability['key']

export const AGENCY_CAPABILITY_KEYS = AGENCY_CAPABILITIES.map(
  capability => capability.key
) as [CapabilityKey, ...CapabilityKey[]]

const CAPABILITY_KEY_SET = new Set<string>(AGENCY_CAPABILITY_KEYS)

export function isCapabilityKey(value: string): value is CapabilityKey {
  return CAPABILITY_KEY_SET.has(value)
}

export function getCapability(key: string): AgencyCapability | undefined {
  return AGENCY_CAPABILITIES.find(capability => capability.key === key)
}
