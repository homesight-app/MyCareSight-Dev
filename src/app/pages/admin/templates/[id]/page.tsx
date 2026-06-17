import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTemplateById } from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import TemplateDetailContent from '@/components/TemplateDetailContent'

export default async function AdminEditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireAdmin()
  const { id } = await params

  const supabase = await createClient()
  const [{ count: unreadNotifications }, { data: template }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    getTemplateById(createAdminClient(), id),
  ])

  if (!template) notFound()

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <div className="p-4 sm:p-6">
        <TemplateDetailContent
          template={template}
          isAdmin={true}
          listPath="/pages/admin/templates"
        />
      </div>
    </AdminLayout>
  )
}
