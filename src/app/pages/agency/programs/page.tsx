import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AgencyProgramsContent from '@/components/AgencyProgramsContent'

const PAGE_SIZE = 50

export default async function AgencyProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/agency')

  const params = await searchParams
  const page   = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search = params.q ?? ''

  const supabase = await createClient()
  const result = await q.getApplicationsWithProgramsPaginated(supabase, { page, pageSize: PAGE_SIZE, search })

  type RawRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    assigned_expert_id: string | null
    application_playbook_items: { status: 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'; requirement_type: string }[]
  }

  const programs = (result.data ?? []) as unknown as RawRow[]

  return (
    <AgencyProgramsContent
      programs={programs}
      totalCount={result.count}
      page={page}
      pageSize={PAGE_SIZE}
      initialSearch={search}
    />
  )
}
