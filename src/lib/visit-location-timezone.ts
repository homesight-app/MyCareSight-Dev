import zipcodes from 'zipcodes'
import tzLookup from 'tz-lookup'
import { normalizeUsZipForLookup } from '@/lib/us-postal-code'
import type { supportedVisitTimezones } from '@/lib/schemas/manager-visit-edit'

export type SupportedVisitTimezone = (typeof supportedVisitTimezones)[number]

const exactTimezones = new Set<SupportedVisitTimezone>([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
])

function canonicalizeTimezone(value: string): SupportedVisitTimezone | null {
  if (exactTimezones.has(value as SupportedVisitTimezone)) return value as SupportedVisitTimezone
  if (value === 'America/Detroit' || value.startsWith('America/Kentucky/')) return 'America/New_York'
  if (value.startsWith('America/Indiana/')) {
    return value === 'America/Indiana/Knox' || value === 'America/Indiana/Tell_City'
      ? 'America/Chicago'
      : 'America/New_York'
  }
  if (value === 'America/Menominee' || value.startsWith('America/North_Dakota/')) return 'America/Chicago'
  if (value === 'America/Boise') return 'America/Denver'
  if (['America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat'].includes(value)) {
    return 'America/Anchorage'
  }
  return null
}

/** Resolve the supported IANA zone from a US visit-location ZIP. */
export function resolveVisitTimezoneFromZip(zipCode: string): SupportedVisitTimezone | null {
  const zip = normalizeUsZipForLookup(zipCode)
  if (!zip) return null
  const location = zipcodes.lookup(zip)
  if (!location) return null
  try {
    return canonicalizeTimezone(tzLookup(location.latitude, location.longitude))
  } catch {
    return null
  }
}
