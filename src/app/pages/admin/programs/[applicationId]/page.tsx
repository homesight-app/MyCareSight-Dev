import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-helpers'
import { readAdminProgramReferences } from '@/lib/repositories/platform-application-dashboard'
import * as q from '@/lib/supabase/query'
import ExpertProgramView from '@/components/ExpertProgramView'
import type { ApplicationPlaybookItem } from '@/lib/supabase/query/playbooks'

export default async function AdminProgramDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  await requireAdmin()
  const { applicationId } = await params
  const [{ data: application }, { data: items }] = await Promise.all([
    q.getApplicationById(applicationId),
    q.getApplicationPlaybookItems(applicationId),
  ])

  if (!application) redirect('/pages/admin/programs')

  type AppRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    license_type_id: string | null
    closed_at: string | null
    close_reason: string | null
    completed_at: string | null
    complete_reason: string | null
    category_id: string | null
    subcategory_id: string | null
  }
  const app = application as unknown as AppRow

  const typedItems = (items ?? []) as ApplicationPlaybookItem[]
  const firstWithPlaybookItem = typedItems.find(i => i.playbook_item_id)
  const [{ data: agencyData }, referencesResult] = await Promise.all([
    app.agency_id ? q.getAgencyNameById(app.agency_id) : Promise.resolve({ data: null }),
    readAdminProgramReferences({
      categoryId: app.category_id,
      subcategoryId: app.subcategory_id,
      playbookItemId: firstWithPlaybookItem?.playbook_item_id ?? null,
    }),
  ])
  const references = referencesResult.data ?? { categoryName: null, subcategoryName: null, playbookId: null }

  return (
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
          categoryName={references.categoryName}
          subcategoryName={references.subcategoryName}
          playbookId={references.playbookId}
          initialItems={typedItems}
          isAdmin
          closedAt={app.closed_at}
          closeReason={app.close_reason}
          completedAt={app.completed_at}
          completeReason={app.complete_reason}
        />
      </div>
  )
}
