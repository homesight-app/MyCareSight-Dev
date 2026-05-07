import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import AdminApplicationDetailContent from '@/components/AdminApplicationDetailContent'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function AdminApplicationDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const [
    { count: unreadNotifications },
    { data: application },
    { data: documents }
  ] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
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

  // Merge owner profile with application
  const applicationWithOwner = {
    ...application,
    user_profiles: ownerProfile || null,
    expert_profile: expertProfile
  }

  return (
    <AdminLayout 
      user={{ id: user.id, email: user.email }} 
      profile={profile} 
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-6">
        <Link
          href="/pages/admin/licenses"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to License Applications
        </Link>
        <AdminApplicationDetailContent
          application={applicationWithOwner}
          documents={documents || []}
          adminUserId={user.id}
          agencyName={agencyData?.name ?? null}
        />
      </div>
    </AdminLayout>
  )
}
