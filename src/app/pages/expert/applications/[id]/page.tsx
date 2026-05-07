import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ExpertDashboardLayout from '@/components/ExpertDashboardLayout'
import ExpertApplicationDetailWrapper from '@/components/ExpertApplicationDetailWrapper'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function ExpertApplicationDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  // Check if user is an expert
  if (session.profile?.role !== 'expert') {
    redirect('/pages/agency')
  }

  const { id } = await params
  const supabase = await createClient()
  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)
  const { data: application } = await q.getApplicationById(supabase, id)
  if (!application) redirect('/pages/expert/clients')
  const [
    { data: documents },
    { data: agencyData },
  ] = await Promise.all([
    q.getApplicationDocumentsByApplicationId(supabase, id),
    (application as any).agency_id
      ? q.getAgencyNameById(supabase, (application as any).agency_id)
      : Promise.resolve({ data: null }),
  ])

  return (
    <ExpertDashboardLayout
      user={{ id: session.user.id, email: session.user.email }}
      profile={session.profile}
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-6 mt-[6rem]">
        <Link
          href="/pages/expert/clients"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Licenses
        </Link>
        <ExpertApplicationDetailWrapper
          application={application}
          documents={documents ?? []}
          agencyName={(agencyData as any)?.name ?? null}
        />
      </div>
    </ExpertDashboardLayout>
  )
}
