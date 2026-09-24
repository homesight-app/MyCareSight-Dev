import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { readExpertProgramPlaybookId } from '@/lib/repositories/platform-application-dashboard'
import * as q from '@/lib/supabase/query'
import ExpertProgramView from '@/components/ExpertProgramView'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'

export default async function ExpertProgramDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  const { applicationId } = await params
  const [{ data: application }, { data: items }] = await Promise.all([
    q.getApplicationById(applicationId),
    q.getApplicationPlaybookItems(applicationId),
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
    ? await q.getAgencyNameById(app.agency_id)
    : { data: null }

  // Derive playbookId from items (for templates tab)
  const typedItems = (items ?? []) as ApplicationPlaybookItem[]
  const firstWithPlaybookItem = typedItems.find(i => i.playbook_item_id)
  const playbookResult = await readExpertProgramPlaybookId(
    applicationId,
    firstWithPlaybookItem?.playbook_item_id ?? null
  )
  if (!playbookResult.data) redirect('/pages/expert/programs')
  const playbookId = playbookResult.data.playbookId

  return (
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
  )
}
