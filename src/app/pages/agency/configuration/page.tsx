import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AgencyConfigurationContent from '@/components/AgencyConfigurationContent'
import { agencyBranchesEnabled } from '@/lib/agency-branches'
import { Suspense } from 'react'
import AgencyInfoServer from '@/components/AgencyInfoServer'

export default async function AgencyConfigurationPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const params = await searchParams
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const profile = session.profile
  if (profile?.role === 'admin') redirect('/pages/admin')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')
  if (profile?.role !== 'company_owner' && profile?.role !== 'care_coordinator') {
    redirect('/pages/agency')
  }


  const agencyId = profile.agency_id ?? null
  const userRole = profile.role ?? null
  const branchesEnabled = agencyBranchesEnabled()

  return (
    <AgencyConfigurationContent
      key={`${agencyId}:${userRole}`}
      initialConfig={null}
      agencyId={agencyId}
      userRole={userRole}
      initialStages={[]}
      branchesEnabled={branchesEnabled}
      initialSection={params.section}
      agencyPanel={userRole === 'company_owner' && agencyId ? <Suspense fallback={<p role="status">Loading agency information…</p>}>
        <AgencyInfoServer branchesEnabled={branchesEnabled} initialTab={params.section === 'branches' ? 'branches' : 'overview'} />
      </Suspense> : undefined}
    />
  )
}
