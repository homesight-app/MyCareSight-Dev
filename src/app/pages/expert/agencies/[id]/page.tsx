import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import AgencyDetailContent from '@/components/AgencyDetailContent'
import type { FeaturePlanSummary } from '@/components/AgencyDetailContent'
import { getConfigurationValues } from '@/app/actions/configuration-values'

export default async function ExpertAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  const { user } = session!
  const { id } = await params


  const { data: agency } = await q.getAgencyById(id)

  if (!agency) redirect('/pages/expert/agencies')

  const adminIds = normalizeAgencyAdminIds(agency.agency_admin_ids as string[] | string | null)

  const [{ data: agencyAdmins }, { data: licenses }, { data: availableAdmins }, { data: programs }, { data: rawFeaturePlans }, { data: certificationCategories }] = await Promise.all([
    adminIds.length > 0
      ? q.getAgencyAdminsByIds(adminIds)
      : Promise.resolve({ data: [] }),
    q.getAgencyCertificationsWithHistory(id),
    q.getUnassignedAgencyAdmins(),
    q.getApplicationsWithProgramsByAgencyId(id),
    q.getFeaturePlans(),
    getConfigurationValues('PLAYBOOK_CATEGORY'),
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
      certificationCategoryOptions={(certificationCategories ?? []).filter(category => category.is_active).map(category => ({ id: category.id, name: category.name }))}
      agencyAdmins={agencyAdmins ?? []}
      availableAdmins={availableAdmins ?? []}
      backPath="/pages/expert/agencies"
      canEdit={true}
      programs={programs ?? []}
      featurePlans={featurePlans}
    />
  )
}
