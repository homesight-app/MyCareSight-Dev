import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import ExpertProgramView from '@/components/ExpertProgramView'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'

export default async function AdminProgramDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { applicationId } = await params
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: application }, { data: items }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getApplicationById(supabase, applicationId),
    q.getApplicationPlaybookItems(supabase, applicationId),
  ])

  if (!application) redirect('/pages/admin/programs')

  type AppRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    license_type_id: string | null
  }
  const app = application as unknown as AppRow

  const { data: agencyData } = app.agency_id
    ? await q.getAgencyNameById(supabase, app.agency_id)
    : { data: null }

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
    <AdminLayout user={{ id: user.id, email: user.email }} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/pages/admin/programs"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Programs
          </Link>
          {/* <Link
            href={`/pages/admin/licenses/applications/${applicationId}`}
            className="text-xs text-blue-600 hover:underline"
          >
            Open full application →
          </Link> */}
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
          isAdmin
        />
      </div>
    </AdminLayout>
  )
}
