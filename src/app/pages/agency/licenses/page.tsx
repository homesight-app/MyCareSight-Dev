import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import LicensesContent from '@/components/LicensesContent'

export default async function LicensesPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)

  const { data: up } = await q.getAgencyIdFromProfile(supabase, session.user.id)
  const agencyId = up?.agency_id ?? null

  const [licensesResult, applicationsResult] = await Promise.all([
    agencyId ? q.getLicensesByAgencyIdOrdered(supabase, agencyId) : Promise.resolve({ data: [] }),
    agencyId ? q.getApplicationsByAgencyId(supabase, agencyId) : Promise.resolve({ data: [] }),
  ])
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
    <DashboardLayout user={session.user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <Suspense fallback={<div className="p-6">Loading...</div>}>
        <LicensesContent 
          licenses={licenses} 
          documentCounts={documentCounts}
          applications={applications}
          applicationDocumentCounts={applicationDocumentCounts}
        />
      </Suspense>
    </DashboardLayout>
  )
}

