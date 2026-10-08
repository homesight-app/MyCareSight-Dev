import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import AgencyCertificationsContent from '@/components/AgencyCertificationsContent'
import { type CertLicense } from '@/components/CertificationDetailModal'
import { getConfigurationValues } from '@/app/actions/configuration-values'

export default async function AgencyCertificationsPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/agency')


  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const [{ data: certifications }, { data: certificationCategories }] = await Promise.all([
    q.getAgencyCertificationsWithHistory(agencyId),
    getConfigurationValues('PLAYBOOK_CATEGORY'),
  ])

  return (
    <AgencyCertificationsContent
      certifications={(certifications ?? []) as unknown as CertLicense[]}
      agencyId={agencyId}
      categoryOptions={(certificationCategories ?? []).filter(category => category.is_active).map(category => ({ id: category.id, name: category.name }))}
    />
  )
}
