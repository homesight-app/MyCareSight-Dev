import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'
import AgencyDetailContent from '@/components/AgencyDetailContent'
import type { FeaturePlanSummary } from '@/components/AgencyDetailContent'

export default async function AdminAgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: agency } = await q.getAgencyById(supabaseAdmin, id)

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
    { data: rawFeaturePlans },
  ] = await Promise.all([
    adminIds.length > 0
      ? q.getAgencyAdminsByIds(supabaseAdmin, adminIds)
      : Promise.resolve({ data: [] }),
    q.getAgencyCertificationsWithHistory(supabaseAdmin, id),
    q.getUnassignedAgencyAdmins(supabaseAdmin),
    q.getActiveOnboardingToken(supabaseAdmin, id),
    q.getKeyStaffByAgencyId(supabaseAdmin, id),
    q.getLeadsByAgency(supabase, id),
    q.getApplicationsWithProgramsByAgencyId(supabaseAdmin, id),
    q.getFeaturePlans(supabaseAdmin),
  ])

  const featurePlans: FeaturePlanSummary[] = (rawFeaturePlans ?? []).map(p => ({
    id: p.id,
    name: p.name,
    plan_features: p.plan_features,
  }))

  const leadIds = (agencyLeads ?? []).map((l: { id: string }) => l.id)
  const { data: agencyLeadDocuments } = leadIds.length > 0
    ? await q.getLeadDocumentsByLeadIds(supabase, leadIds)
    : { data: [] }

  return (
      <AgencyDetailContent
        agency={agency}
        licenses={(licenses ?? []) as unknown as Parameters<typeof AgencyDetailContent>[0]['licenses']}
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
      />
  )
}
