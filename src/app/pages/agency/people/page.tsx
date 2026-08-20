import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AgencyPeopleTab from '@/components/AgencyPeopleTab'

export default async function AgencyPeoplePage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const agencyId = (session.profile as { agency_id?: string | null })?.agency_id
  if (!agencyId) redirect('/pages/agency')

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">People</h1>
      <AgencyPeopleTab agencyId={agencyId} />
    </div>
  )
}
