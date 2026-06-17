import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { getTemplateById } from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import TemplateDetailContent from '@/components/TemplateDetailContent'

export default async function AgencyEditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const { id } = await params
  const supabase = await createClient()
  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)

  if (profile?.role === 'admin') redirect(`/pages/admin/templates/${id}`)
  if (profile?.role !== 'company_owner') redirect('/pages/agency')

  const [{ data: up }, { count: unreadNotifications }, { data: template }] = await Promise.all([
    q.getAgencyIdFromProfile(supabase, session.user.id),
    q.getUnreadNotificationsCount(supabase, session.user.id),
    getTemplateById(supabase, id),
  ])

  const agencyId = up?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  if (!template) notFound()

  // Prevent editing global templates from agency context
  if (template.is_global) redirect('/pages/agency/templates')

  return (
    <DashboardLayout user={session.user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <div className="p-4 sm:p-6">
        <TemplateDetailContent
          template={template}
          isAdmin={false}
          agencyId={agencyId}
          listPath="/pages/agency/templates"
        />
      </div>
    </DashboardLayout>
  )
}
