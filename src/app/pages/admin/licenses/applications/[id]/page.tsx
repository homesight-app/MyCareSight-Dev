import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ApplicationDetailContent from '@/components/ApplicationDetailContent'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function AdminApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const { back } = await searchParams
  const supabase = await createClient()

  // Validate the back path to prevent open redirect — must start with /pages/
  const backHref = back && decodeURIComponent(back).startsWith('/pages/')
    ? decodeURIComponent(back)
    : '/pages/admin/licenses'
  const backLabel = back ? 'Back to Agency' : 'Back to License Applications'

  const [
    { data: application },
    { data: documents }
  ] = await Promise.all([
    q.getApplicationById(supabase, id),
    q.getApplicationDocumentsByApplicationId(supabase, id)
  ])

  if (!application) {
    redirect('/pages/admin/licenses')
  }

  const [
    { data: ownerProfile },
    { data: expertProfile }
  ] = await Promise.all([
    application.company_owner_id
      ? q.getUserProfileById(supabase, application.company_owner_id)
      : Promise.resolve({ data: null, error: null }),
    application.assigned_expert_id
      ? q.getUserProfileById(supabase, application.assigned_expert_id)
      : Promise.resolve({ data: null, error: null })
  ])

  const { data: agencyData } = (application as any).agency_id
    ? await q.getAgencyNameById(supabase, (application as any).agency_id)
    : { data: null }

  return (
      <div className="space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>
        <ApplicationDetailContent
          application={application}
          documents={documents || []}
          ownerProfile={ownerProfile}
          assignedExpertProfile={expertProfile}
          agencyName={agencyData?.name ?? null}
          showInlineTabs={true}
        />
      </div>
  )
}
