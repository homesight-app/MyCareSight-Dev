import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { assertAgencyReportsPageAccess } from '@/lib/agency-reports-access'
import AgencyConfigurationContent from '@/components/AgencyConfigurationContent'

export default async function AgencyConfigurationPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const profile = session!.profile
  assertAgencyReportsPageAccess(profile)

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const config = agencyId
    ? (await q.getAgencyConfiguration(supabase, agencyId)).data
    : null

  return (
    <AgencyConfigurationContent initialConfig={config} />
  )
}
