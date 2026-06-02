import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import DashboardLayout from '@/components/DashboardLayout'
import ClientDetailContent from '@/components/ClientDetailContent'
import { getCachedAgencyClientDetailBundle } from '@/lib/server-cache/agency-client-detail-bundle'

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

  const { data: profile } = await q.getUserProfileFull(supabase, session.user.id)
  if (profile?.role === 'admin') redirect('/pages/admin')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')

  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, session.user.id)

  const bundle = await getCachedAgencyClientDetailBundle(id, session.user.id)
  if (!bundle) {
    redirect('/pages/agency/clients')
  }

  const { data: addresses } = await q.getPatientAddresses(supabase, id)
  const { data: agencyProfile } = await q.getAgencyIdFromProfile(supabase, session.user.id)
  const agencyId = agencyProfile?.agency_id ?? null

  const role = profile?.role ?? ''
  const canManageNotes =
    role === 'agency_admin' || role === 'company_owner' || role === 'care_coordinator'

  return (
    <DashboardLayout
      user={session.user}
      profile={profile}
      unreadNotifications={unreadNotifications ?? 0}
    >
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
      />
    </DashboardLayout>
  )
}
