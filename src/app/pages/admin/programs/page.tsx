import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminProgramsContent from '@/components/AdminProgramsContent'

export default async function AdminProgramsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [
    { data: requestedData },
    { data: allProgramsData },
  ] = await Promise.all([
    q.getRequestedProgramApplications(supabase),
    q.getApplicationsWithPrograms(supabase),
  ])

  type RequestedRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    playbook_id: string | null
    created_at: string | null
    agencies: { id: string; name: string } | null
  }

  type ActiveRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    assigned_expert_id: string | null
    agencies: { id: string; name: string } | null
    application_playbook_items: { status: 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'; requirement_type: string }[]
  }

  const requestedPrograms = (requestedData ?? []) as unknown as RequestedRow[]
  const allPrograms = ((allProgramsData ?? []) as unknown as ActiveRow[]).filter(
    a => a.application_playbook_items && a.application_playbook_items.length > 0
  )

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage program requests and track active program progress.
          </p>
        </div>
        <AdminProgramsContent
          requestedPrograms={requestedPrograms}
          allPrograms={allPrograms}
        />
      </div>
  )
}
