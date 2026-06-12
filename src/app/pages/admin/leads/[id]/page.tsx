import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import LeadDetailContent from '@/components/LeadDetailContent'
import { ADMIN_LEAD_CONTEXT } from '@/lib/constants/lead-configs'
import type { ComponentProps } from 'react'

type LeadDetailProps = ComponentProps<typeof LeadDetailContent>

export default async function AdminLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: lead }, { data: notes }, { data: tasks }] =
    await Promise.all([
      q.getUnreadNotificationsCount(supabase, user.id),
      q.getLeadById(supabase, id),
      q.getLeadNotes(supabase, id),
      q.getLeadTasks(supabase, id),
    ])

  if (!lead) redirect('/pages/admin/leads')

  return (
    <AdminLayout
      user={user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    >
      <LeadDetailContent
        lead={lead as unknown as LeadDetailProps['lead']}
        notes={(notes ?? []) as unknown as LeadDetailProps['notes']}
        tasks={tasks ?? []}
        context={ADMIN_LEAD_CONTEXT}
      />
    </AdminLayout>
  )
}
