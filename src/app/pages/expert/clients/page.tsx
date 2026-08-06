import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ExpertClientsContent from '@/components/ExpertClientsContent'

export default async function ExpertClientsPage() {
  const session = await getSession()

  const supabase = await createClient()
  const { data: applicationsData } = await q.getApplicationsByAssignedExpertId(supabase, session!.user.id)

  // Bulk-fetch agency names — RLS migration 089 grants experts SELECT on agencies
  const agencyIds = Array.from(new Set(
    (applicationsData ?? []).map(a => (a as any).agency_id).filter(Boolean) as string[]
  ))
  const { data: agenciesData } = agencyIds.length > 0
    ? await q.getAgenciesByIds(supabase, agencyIds)
    : { data: [] }
  const agencyNames: Record<string, string> = {}
  for (const a of agenciesData ?? []) agencyNames[a.id] = a.name

  // Calculate statistics
  const totalApplications = (applicationsData || []).length
  const activeApplications = (applicationsData || []).filter(app =>
    app.status === 'requested' || app.status === 'in_progress' || app.status === 'under_review' || app.status === 'needs_revision'
  ).length
  const pendingReviews = (applicationsData || []).filter(app =>
    app.status === 'under_review' || app.status === 'needs_revision'
  ).length

  return (
    <ExpertClientsContent
      applications={applicationsData || []}
      totalApplications={totalApplications}
      activeApplications={activeApplications}
      pendingReviews={pendingReviews}
      agencyNames={agencyNames}
    />
  )
}
