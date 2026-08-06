import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AgencyCertificationsContent from '@/components/AgencyCertificationsContent'
import { type CertLicense } from '@/components/CertificationDetailModal'

export default async function AgencyCertificationsPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = session.profile?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/agency')

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const { data: certifications } = await q.getAgencyCertificationsWithHistory(supabase, agencyId)

  return (
    <AgencyCertificationsContent
      certifications={(certifications ?? []) as unknown as CertLicense[]}
      agencyId={agencyId}
    />
  )
}
