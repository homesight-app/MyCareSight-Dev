import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import PlaybookDetailContent, { type PlaybookRow } from '@/components/PlaybookDetailContent'

const TYPE_LABELS: Record<string, string> = {
  license_requirement: 'License Requirement',
  package: 'Package',
  onboarding: 'Onboarding',
  compliance: 'Compliance',
}

export default async function AdminPlaybookDetailPage({
  params,
}: {
  params: Promise<{ playbookId: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { playbookId } = await params
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: playbook }, { data: items }, { data: templates }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getPlaybookById(supabase, playbookId),
    q.getPlaybookItems(supabase, playbookId),
    q.getPlaybookTemplates(supabase, playbookId),
  ])

  if (!playbook) redirect('/pages/admin/playbooks')

  const lr = (playbook as unknown as { license_requirement: { id: string; state: string; license_type: string } | null }).license_requirement
  const pb = playbook as unknown as PlaybookRow
  const displayState = pb.state ?? lr?.state ?? null

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <div className="space-y-4 md:space-y-6">
        {/* Back button */}
        <Link
          href="/pages/admin/playbooks"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Playbooks
        </Link>

        {/* Page header — mirrors license requirements page */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{pb.name}</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            {displayState && <>{displayState} • </>}
            {TYPE_LABELS[pb.playbook_type] ?? pb.playbook_type}
            {pb.description && <> • {pb.description}</>}
          </p>
        </div>

        {/* Tabbed detail card */}
        <PlaybookDetailContent
          playbook={pb}
          licenseRequirementId={lr?.id ?? null}
          initialItems={items ?? []}
          initialTemplates={(templates ?? []) as import('@/lib/supabase/query/playbooks').PlaybookTemplate[]}
        />
      </div>
    </AdminLayout>
  )
}
