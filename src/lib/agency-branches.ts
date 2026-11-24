/** Enable only after the operator applies and verifies the manual branch migration. */
export function agencyBranchesEnabled(): boolean {
  return process.env.AGENCY_BRANCHES_ENABLED === 'true'
}

export const BRANCH_PAGE_SIZE = 25
export const BRANCH_OPTION_LIMIT = 100

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
