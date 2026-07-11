import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import ClientProgramView from '@/components/ClientProgramView'

export default async function AgencyProgramDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/agency')

  const { applicationId } = await params
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: application }, { items }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, session.user.id),
    q.getApplicationById(supabase, applicationId),
    q.getApplicationPlaybookItems(supabase, applicationId).then(r => ({ items: r.data ?? [] })),
  ])

  if (!application) redirect('/pages/agency/programs')

  type AppRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    license_type_id: string | null
    progress_percentage: number | null
  }
  const app = application as unknown as AppRow

  return (
    <DashboardLayout user={session.user} profile={session.profile} unreadNotifications={unreadNotifications || 0}>
      <div className="space-y-4">
        <Link href="/pages/agency/programs" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          ← Back to Programs
        </Link>

        <ClientProgramView
          applicationId={applicationId}
          applicationName={app.application_name}
          state={app.state}
          status={app.status}
          agencyId={app.agency_id}
          licenseTypeId={app.license_type_id}
          initialItems={items as import('@/lib/supabase/query/playbooks').ApplicationPlaybookItem[]}
          initialPct={app.progress_percentage ?? 0}
        />
      </div>
    </DashboardLayout>

  )
}
