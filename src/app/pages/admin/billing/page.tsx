import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import BillingContent from '@/components/BillingContent'
import { getPricingForMonth } from '@/app/actions/pricing'
import { getCachedAgenciesForBilling, getCachedLicenseTypesForBilling } from '@/lib/server-cache/reference-lists'

export default async function BillingPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  await requireAdmin()
  const supabase = await createClient()
  const params = await searchParams

  const now = new Date()
  const selectedMonth = params.month ? parseInt(params.month) : now.getMonth() + 1
  const selectedYear = params.year ? parseInt(params.year) : now.getFullYear()

  const [
    { data: agencies },
    { data: staffMembers },
    { data: allCases },
    { data: licenseTypes },
    pricingResult,
  ] = await Promise.all([
    getCachedAgenciesForBilling(),
    q.getStaffMembersWithAgencyActive(supabase),
    q.getCasesOrderedByStartedDate(supabase),
    getCachedLicenseTypesForBilling(),
    getPricingForMonth(selectedYear, selectedMonth),
  ])

  if (!agencies) {
    return (
        <div>Error loading agencies</div>
    )
  }

  type StaffMember = { id: string; agency_id: string | null; [key: string]: any }
  const staffByAgency: Record<string, StaffMember[]> = {}
  if (staffMembers) {
    staffMembers.forEach(staff => {
      if (staff?.agency_id) {
        if (!staffByAgency[staff.agency_id]) staffByAgency[staff.agency_id] = []
        staffByAgency[staff.agency_id].push(staff)
      }
    })
  }

  type Case = {
    id: string
    case_id: string
    client_id: string
    business_name: string
    state: string
    status: string
    progress_percentage: number
    started_date: string
    last_activity: string
    documents_count: number
    steps_count: number
  }
  const allCasesByClient: Record<string, Case[]> = {}
  if (allCases) {
    allCases.forEach(c => {
      if (c?.client_id) {
        if (!allCasesByClient[c.client_id]) allCasesByClient[c.client_id] = []
        allCasesByClient[c.client_id].push(c as Case)
      }
    })
  }

  const pricingData = pricingResult.data
  const ownerLicenseRate = pricingData?.owner_admin_license || 0
  const staffLicenseRate = pricingData?.staff_license || 0

  // Build billing data per agency: owner count = agency admins (clients) in agency, staff = staff in agency, cases = all cases for those clients
  const baseBillingData = agencies.map(agency => {
    const adminIds = (agency.agency_admin_ids as string[] | null) || []
    const staff = staffByAgency[agency.id] || []
    const allAgencyCases: Case[] = []
    adminIds.forEach(cid => {
      (allCasesByClient[cid] || []).forEach(c => allAgencyCases.push(c))
    })

    const ownerCount = adminIds.length
    const staffCount = staff.length
    const totalLicenses = ownerCount + staffCount
    const ownerLicenseFee = ownerCount * ownerLicenseRate
    const staffLicenseFee = staffCount * staffLicenseRate
    const totalLicenseFee = ownerLicenseFee + staffLicenseFee

    return {
      agency: { id: agency.id, name: agency.name ?? '' },
      ownerCount,
      staffCount,
      totalLicenses,
      ownerLicenseFee,
      staffLicenseFee,
      totalLicenseFee,
      allCases: allAgencyCases
    }
  })

  const activeAgencies = agencies.length

  return (
      <BillingContent
        baseBillingData={baseBillingData}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        activeAgencies={activeAgencies}
        ownerLicenseRate={ownerLicenseRate}
        staffLicenseRate={staffLicenseRate}
        licenseTypes={(licenseTypes ?? []) as unknown as Parameters<typeof BillingContent>[0]['licenseTypes']}
      />
  )
}
