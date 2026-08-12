import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import AgencyDetailContent from '@/components/AgencyDetailContent'
import type { FeaturePlanSummary } from '@/components/AgencyDetailContent'

export default async function ExpertAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  const { user } = session!
  const { id } = await params

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: agency } = await q.getAgencyById(supabaseAdmin, id)

  if (!agency) redirect('/pages/expert/agencies')

  const adminIds = normalizeAgencyAdminIds(agency.agency_admin_ids as string[] | string | null)

  const [{ data: agencyAdmins }, { data: licenses }, { data: availableAdmins }, { data: programs }, { data: rawFeaturePlans }] = await Promise.all([
    adminIds.length > 0
      ? q.getAgencyAdminsByIds(supabaseAdmin, adminIds)
      : Promise.resolve({ data: [] }),
    q.getAgencyCertificationsWithHistory(supabaseAdmin, id),
    q.getUnassignedAgencyAdmins(supabaseAdmin),
    q.getApplicationsWithProgramsByAgencyId(supabaseAdmin, id),
    q.getFeaturePlans(supabaseAdmin),
  ])

  const featurePlans: FeaturePlanSummary[] = (rawFeaturePlans ?? []).map(p => ({
    id: p.id,
    name: p.name,
    plan_features: p.plan_features,
  }))

  return (
    <AgencyDetailContent
      agency={agency}
      licenses={(licenses ?? []) as unknown as Parameters<typeof AgencyDetailContent>[0]['licenses']}
      agencyAdmins={agencyAdmins ?? []}
      availableAdmins={availableAdmins ?? []}
      backPath="/pages/expert/agencies"
      canEdit={true}
      programs={programs ?? []}
      featurePlans={featurePlans}
    />
  )
}
