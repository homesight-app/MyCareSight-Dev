import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import LicensesContent from '@/components/LicensesContent'

export default async function LicensesPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()
  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null

  const [licensesResult, applicationsResult, playbooksResult] = await Promise.all([
    agencyId ? q.getLicensesByAgencyIdOrdered(supabase, agencyId) : Promise.resolve({ data: [] }),
    agencyId ? q.getApplicationsByAgencyId(supabase, agencyId) : Promise.resolve({ data: [] }),
    q.getPlaybooksWithRequirements(supabase),
  ])

  const playbookSet = new Set(
    (playbooksResult.data ?? []).map(p => {
      const lr = p.license_requirement as unknown as { state: string; license_type: string } | null
      return lr ? `${lr.state}|${lr.license_type}` : null
    }).filter(Boolean) as string[]
  )
  const licenses = licensesResult.data ?? []

  const licenseIds = licenses.map(l => l.id)
  const { data: licenseDocsData } = licenseIds.length > 0
    ? await q.getLicenseDocumentsByLicenseIds(supabase, licenseIds)
    : { data: [] }
  const documentCounts: Record<string, number> = {}
  ;(licenseDocsData ?? []).forEach((doc: { license_id: string }) => {
    documentCounts[doc.license_id] = (documentCounts[doc.license_id] || 0) + 1
  })

  const applications = applicationsResult.data ?? []
  const applicationIds = applications.map(a => a.id)
  const { data: appDocsData } = applicationIds.length > 0
    ? await q.getApplicationDocumentsApplicationIds(supabase, applicationIds)
    : { data: [] }
  const applicationDocumentCounts: Record<string, number> = {}
  ;(appDocsData ?? []).forEach((doc: { application_id: string }) => {
    applicationDocumentCounts[doc.application_id] = (applicationDocumentCounts[doc.application_id] || 0) + 1
  })

  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <LicensesContent
        licenses={licenses}
        documentCounts={documentCounts}
        applications={applications}
        applicationDocumentCounts={applicationDocumentCounts}
        playbookSet={playbookSet}
      />
    </Suspense>
  )
}

