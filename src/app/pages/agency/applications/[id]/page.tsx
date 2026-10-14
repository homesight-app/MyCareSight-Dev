import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import ApplicationDetailWrapper from '@/components/ApplicationDetailWrapper'
import { requireAgencyCapability } from '@/lib/feature-access'
import { withUserContext } from '@/db'

export default async function ApplicationDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/agency')

  let actor
  try {
    actor = await requireAgencyCapability('homesights_services')
  } catch {
    redirect('/pages/agency/applications')
  }

  const { id } = await params

  const application = await withUserContext(actor.userId, actor.role, actor.agencyId, async () => {
    const { data } = await q.getApplicationByIdAndAgencyId(id, actor.agencyId)
    return data
  })

  if (!application) redirect('/pages/agency/licenses')

  const documents = await withUserContext(actor.userId, actor.role, actor.agencyId, async () => {
    const { data } = await q.getApplicationDocumentsByApplicationId(id)
    return data ?? []
  })

  return (
    <ApplicationDetailWrapper
      application={application}
      documents={documents}
    />
  )
}
