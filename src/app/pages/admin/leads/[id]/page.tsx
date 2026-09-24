import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { readAdminLeadPlatformStaff } from '@/lib/repositories/platform-application-dashboard'
import * as q from '@/lib/supabase/query'
import LeadDetailContent from '@/components/LeadDetailContent'
import { ADMIN_LEAD_CONTEXT } from '@/lib/constants/lead-configs'
import type { ComponentProps } from 'react'

type LeadDetailProps = ComponentProps<typeof LeadDetailContent>

export default async function AdminLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { profile } = await requireAdmin()
  const { id } = await params
  const [{ data: lead }, { data: notes }, { data: tasks }, { data: documents }, { data: platformStaff }] =
    await Promise.all([
      q.getLeadById(id),
      q.getLeadNotes(id),
      q.getLeadTasks(id),
      q.getLeadDocuments(id),
      readAdminLeadPlatformStaff(),
    ])

  if (!lead) redirect('/pages/admin/leads')

  return (
      <LeadDetailContent
        lead={lead as unknown as LeadDetailProps['lead']}
        notes={(notes ?? []) as unknown as LeadDetailProps['notes']}
        tasks={tasks ?? []}
        documents={(documents ?? []) as unknown as LeadDetailProps['documents']}
        context={ADMIN_LEAD_CONTEXT}
        currentUserRole={profile?.role}
        platformStaff={platformStaff ?? []}
      />
  )
}
