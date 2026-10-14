import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import * as q from '@/lib/supabase/query'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import AgencyDetailContent from '@/components/AgencyDetailContent'
import type { FeaturePlanSummary } from '@/components/AgencyDetailContent'
import { listLeadIntegrationCredentials } from '@/lib/repositories/lead-integrations'
import { websiteLeadIntegrationEnabled } from '@/lib/features/website-lead-integration'
import { getConfigurationValues } from '@/app/actions/configuration-values'
import { withUserContext } from '@/db'

export default async function AdminAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const adminSession = await requireAdmin()
  const { id } = await params
  const integrationEnabled = websiteLeadIntegrationEnabled()


  const { data: agency } = await q.getAgencyById(id)

  if (!agency) redirect('/pages/admin/agencies')

  const adminIds = normalizeAgencyAdminIds(agency.agency_admin_ids as string[] | string | null)

  const [
    { data: agencyAdmins },
    { data: licenses },
    { data: availableAdmins },
    { data: activeToken },
    { data: keyStaff },
    { data: agencyLeads },
    { data: programs },
    { data: certificationCategories },
    integrationCredentials,
  ] = await Promise.all([
    adminIds.length > 0
      ? q.getAgencyAdminsByIds(adminIds)
      : Promise.resolve({ data: [] }),
    q.getAgencyCertificationsWithHistory(id),
    q.getUnassignedAgencyAdmins(),
    q.getActiveOnboardingToken(id),
    q.getKeyStaffByAgencyId(id),
    q.getLeadsByAgency(id),
    q.getApplicationsWithProgramsByAgencyId(id),
    getConfigurationValues('PLAYBOOK_CATEGORY'),
    integrationEnabled ? listLeadIntegrationCredentials(id) : Promise.resolve([]),
  ])

  const { data: rawFeaturePlans } = await withUserContext(
    adminSession.user.id,
    'admin',
    null,
    () => q.getFeaturePlans()
  )

  const featurePlans: FeaturePlanSummary[] = (rawFeaturePlans ?? []).map(p => ({
    id: p.id,
    name: p.name,
    plan_capabilities: p.plan_capabilities,
  }))

  const leadIds = (agencyLeads ?? []).map((l: { id: string }) => l.id)
  const { data: agencyLeadDocuments } = leadIds.length > 0
    ? await q.getLeadDocumentsByLeadIds(leadIds)
    : { data: [] }

  return (
      <AgencyDetailContent
        agency={agency}
        licenses={(licenses ?? []) as unknown as Parameters<typeof AgencyDetailContent>[0]['licenses']}
        certificationCategoryOptions={(certificationCategories ?? []).filter(category => category.is_active).map(category => ({ id: category.id, name: category.name }))}
        agencyAdmins={agencyAdmins ?? []}
        availableAdmins={availableAdmins ?? []}
        backPath="/pages/admin/agencies"
        canEdit={true}
        activeToken={activeToken ?? null}
        keyStaff={keyStaff ?? []}
        agencyLeads={agencyLeads ?? []}
        agencyLeadDocuments={agencyLeadDocuments ?? []}
        programs={programs ?? []}
        featurePlans={featurePlans}
        integrationCredentials={integrationCredentials}
        canManageIntegrations={integrationEnabled}
      />
  )
}
