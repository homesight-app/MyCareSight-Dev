import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ExpertDashboardLayout from '@/components/ExpertDashboardLayout'
import ExpertProgramView from '@/components/ExpertProgramView'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'

export default async function ExpertProgramDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  if (session.profile?.role !== 'expert') redirect('/pages/expert/clients')

  const { applicationId } = await params
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: application }, { data: items }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, session.user.id),
    q.getApplicationById(supabase, applicationId),
    q.getApplicationPlaybookItems(supabase, applicationId),
  ])

  if (!application) redirect('/pages/expert/programs')

  type AppRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    license_type_id: string | null
    progress_percentage: number | null
    closed_at: string | null
    close_reason: string | null
    completed_at: string | null
    complete_reason: string | null
  }
  const app = application as unknown as AppRow

  // Resolve agency name
  const { data: agencyData } = app.agency_id
    ? await q.getAgencyNameById(supabase, app.agency_id)
    : { data: null }

  // Derive playbookId from items (for templates tab)
  const typedItems = (items ?? []) as ApplicationPlaybookItem[]
  const firstWithPlaybookItem = typedItems.find(i => i.playbook_item_id)
  let playbookId: string | null = null
  if (firstWithPlaybookItem) {
    const { data: pi } = await supabase
      .from('playbook_items')
      .select('playbook_id')
      .eq('id', firstWithPlaybookItem.playbook_item_id)
      .maybeSingle()
    playbookId = pi?.playbook_id ?? null
  }

  return (
    <ExpertDashboardLayout user={session.user} profile={session.profile} unreadNotifications={unreadNotifications || 0}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/pages/expert/programs"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Programs
          </Link>

        </div>

        <ExpertProgramView
          applicationId={applicationId}
          applicationName={app.application_name}
          state={app.state}
          status={app.status}
          agencyId={app.agency_id}
          agencyName={agencyData?.name ?? null}
          playbookId={playbookId}
          initialItems={typedItems}
          closedAt={app.closed_at}
          closeReason={app.close_reason}
          completedAt={app.completed_at}
          completeReason={app.complete_reason}
        />
      </div>
    </ExpertDashboardLayout>
  )
}
