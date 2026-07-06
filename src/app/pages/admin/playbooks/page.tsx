import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import PlaybookLibraryContent from '@/components/PlaybookLibraryContent'

export default async function AdminPlaybooksPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: playbooks }, { data: licenseRequirements }] =
    await Promise.all([
      q.getUnreadNotificationsCount(supabase, user.id),
      q.getAllPlaybooks(supabase),
      supabase
        .from('license_requirements')
        .select('id, state, license_type')
        .order('state')
        .order('license_type'),
    ])

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <PlaybookLibraryContent
        playbooks={(playbooks ?? []) as unknown as Parameters<typeof PlaybookLibraryContent>[0]['playbooks']}
        licenseRequirements={(licenseRequirements ?? []) as { id: string; state: string; license_type: string }[]}
      />
    </AdminLayout>
  )
}
