import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import ClientDetailContent from '@/components/ClientDetailContent'
import {
  getCachedAgencyClientDetailBundle,
  normalizeAgencyClientDetailTab,
} from '@/lib/server-cache/agency-client-detail-bundle'
import { getAgencyAllowedFeatures } from '@/lib/feature-access'

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const { id } = await params
  const activeTab = normalizeAgencyClientDetailTab((await searchParams).tab)
  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const role = session!.profile?.role ?? ''

  const [bundle, addresses] = await withUserContext(session!.user.id, role, agencyId, () =>
    Promise.all([
      getCachedAgencyClientDetailBundle(id, session!.user.id, activeTab),
      q.getPatientAddresses(id),
    ])
  )

  if (!bundle) {
    redirect('/pages/agency/clients')
  }

  const canManageNotes =
    role === 'company_owner' || role === 'care_coordinator'

  const allowedFeatures = await getAgencyAllowedFeatures(agencyId)
  const canSchedule = allowedFeatures === null || allowedFeatures.includes('clients_scheduling')

  return (
    <ClientDetailContent
      key={`${id}:${activeTab}`}
      client={bundle.client}
      allClients={bundle.allClients || []}
      representatives={bundle.representativesList}
      caregiverRequirements={bundle.caregiverRequirements}
      incidents={bundle.incidentsList}
      adls={bundle.adlsList}
      adlSchedules={bundle.adlSchedulesList}
      staff={bundle.staffList}
      contractedHours={bundle.contractedHoursList}
      skilledCarePlanTasks={bundle.skilledCarePlanTasks}
      skilledSchedules={bundle.skilledSchedulesList}
      serviceContracts={bundle.serviceContracts}
      initialAddresses={addresses.data ?? []}
      canManageNotes={canManageNotes}
      agencyId={agencyId ?? undefined}
      canSchedule={canSchedule}
    />
  )
}
