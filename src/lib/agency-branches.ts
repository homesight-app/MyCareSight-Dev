/** Enable only after the operator applies and verifies the manual branch migration. */
export function agencyBranchesEnabled(): boolean {
  return process.env.AGENCY_BRANCHES_ENABLED === 'true'
}

export const BRANCH_PAGE_SIZE = 25
export const BRANCH_OPTION_LIMIT = 100

export type AgencyInfoRecord = {
  id: string
  name: string
  business_type: string | null
  tax_id: string | null
  primary_license_number: string | null
  website: string | null
  physical_street_address: string | null
  physical_city: string | null
  physical_state: string | null
  physical_zip_code: string | null
  same_as_physical: boolean | null
  mailing_street_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip_code: string | null
}

export type AgencyBranch = {
  id: string
  agency_id: string
  code: string
  name: string
  is_default: boolean
  status: 'active' | 'inactive'
  timezone: string
  street_address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  phone: string | null
  email: string | null
}

export type BranchRecordKind = 'lead' | 'client' | 'application'
