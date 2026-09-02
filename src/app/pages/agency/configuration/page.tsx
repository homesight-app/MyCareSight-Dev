import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import AgencyConfigurationContent from '@/components/AgencyConfigurationContent'
import { getAgencyBrandingAction } from '@/app/actions/agencies'

export default async function AgencyConfigurationPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const profile = session!.profile
  assertAgencyReportsPageAccess(profile)

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const userRole = (session!.profile as { role?: string } | null)?.role ?? null

  const [configResult, stagesResult, branding] = await Promise.all([
    agencyId ? q.getAgencyConfiguration(supabase, agencyId) : Promise.resolve({ data: null }),
    agencyId ? q.getAgencyLeadStages(supabase, agencyId) : Promise.resolve({ data: null }),
    agencyId ? getAgencyBrandingAction(agencyId) : Promise.resolve({ logoUrl: null, logoIconUrl: null, primaryColor: null, sidebarColor: null }),
  ])

  let stages = stagesResult.data ?? []
  if (stages.length === 0 && agencyId) {
    const seeded = await q.seedDefaultAgencyLeadStages(supabase, agencyId)
    stages = seeded.data ?? []
  }

  return (
    <AgencyConfigurationContent
      initialConfig={configResult.data}
      agencyId={agencyId}
      userRole={userRole}
      initialStages={stages}
      initialBranding={{
        logoUrl: branding.logoUrl,
        logoIconUrl: branding.logoIconUrl,
        primaryColor: branding.primaryColor,
        sidebarColor: branding.sidebarColor,
      }}
    />
  )
}
