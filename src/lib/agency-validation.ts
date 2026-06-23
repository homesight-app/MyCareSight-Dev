export type AgencyAddressType = 'corporate' | 'licensed_office' | 'mailing'

export interface AddressInput {
  street?: string | null
  city?:   string | null
  state?:  string | null
  zip?:    string | null
}

export interface AddressFieldMatch {
  field:          string
  agencyValue:    string | null
  submittedValue: string | null
  match:          boolean
}

/**
 * Compares each field of an agency address type against a submitted address.
 * Used in Phase 2 to validate that a document's extracted address matches
 * the agency's stored address.
 *
 * @param agency  Plain agency row object from the DB
 * @param type    Which address to compare ('corporate' | 'licensed_office' | 'mailing')
 * @param submitted  Address extracted from a submitted document
 * @returns Field-by-field match results
 */
export function checkAgencyAddressMatch(
  agency: Record<string, string | null | undefined>,
  type: AgencyAddressType,
  submitted: AddressInput
): AddressFieldMatch[] {
  const prefix =
    type === 'corporate'       ? 'physical'        :
    type === 'licensed_office' ? 'licensed_office' : 'mailing'

  const streetKey = type === 'corporate' ? 'physical_street_address'
    : type === 'mailing' ? 'mailing_street_address'
    : 'licensed_office_street'

  const zipKey = type === 'corporate' ? 'physical_zip_code'
    : type === 'mailing' ? 'mailing_zip_code'
    : 'licensed_office_zip'

  return [
    { field: 'street', agencyValue: (agency[streetKey] ?? null) as string | null, submittedValue: submitted.street ?? null },
    { field: 'city',   agencyValue: (agency[`${prefix}_city`] ?? null) as string | null,  submittedValue: submitted.city   ?? null },
    { field: 'state',  agencyValue: (agency[`${prefix}_state`] ?? null) as string | null, submittedValue: submitted.state  ?? null },
    { field: 'zip',    agencyValue: (agency[zipKey] ?? null) as string | null,             submittedValue: submitted.zip    ?? null },
  ].map(f => ({
    ...f,
    match: normalizeAddr(f.agencyValue) === normalizeAddr(f.submittedValue),
  }))
}

function normalizeAddr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}
