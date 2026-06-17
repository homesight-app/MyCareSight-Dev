import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTemplates } from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import TemplatesContent from '@/components/TemplatesContent'

export default async function AdminTemplatesPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: templates }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    getTemplates(createAdminClient(), { includeInactive: true }),
  ])

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications ?? 0}>
      <div className="p-4 sm:p-6">
        <TemplatesContent
          templates={templates ?? []}
          isAdmin={true}
          basePath="/pages/admin/templates"
        />
      </div>
    </AdminLayout>
  )
}
