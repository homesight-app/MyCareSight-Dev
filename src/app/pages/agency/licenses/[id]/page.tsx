import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import LicenseDetailContent from '@/components/LicenseDetailContent'

export default async function LicenseDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const { id } = await params
  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  const [{ count: unreadNotifications }, { data: up }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, session.user.id),
    q.getAgencyIdFromProfile(supabase, session.user.id),
  ])
  const agencyId = up?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency/licenses')
  const { data: license } = await q.getLicenseByIdAndAgencyId(supabase, id, agencyId)
  if (!license) redirect('/pages/agency/licenses')
  const { data: documentsData } = await q.getLicenseDocumentsByLicenseId(supabase, id)
  const documents = documentsData ?? []

  return (
    <DashboardLayout user={session.user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <LicenseDetailContent 
        license={license}
        documents={documents}
      />
    </DashboardLayout>
  )
}
