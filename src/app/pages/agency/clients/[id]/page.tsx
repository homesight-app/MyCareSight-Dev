import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ClientDetailContent from '@/components/ClientDetailContent'
import { getCachedAgencyClientDetailBundle } from '@/lib/server-cache/agency-client-detail-bundle'
import { getAgencyAllowedFeatures } from '@/lib/feature-access'

export default async function ClientDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const { id } = await params
  const supabase = await createClient()

  const bundle = await getCachedAgencyClientDetailBundle(id, session.user.id)
  if (!bundle) {
    redirect('/pages/agency/clients')
  }

  const { data: addresses } = await q.getPatientAddresses(supabase, id)
  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null

  const role = session!.profile?.role ?? ''
  const canManageNotes =
    role === 'agency_admin' || role === 'company_owner' || role === 'care_coordinator'

  const allowedFeatures = await getAgencyAllowedFeatures(agencyId)
  const canSchedule = allowedFeatures === null || allowedFeatures.includes('clients_scheduling')

  return (
    <ClientDetailContent
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
      initialAddresses={addresses ?? []}
      canManageNotes={canManageNotes}
      agencyId={agencyId ?? undefined}
      canSchedule={canSchedule}
    />
  )
}
