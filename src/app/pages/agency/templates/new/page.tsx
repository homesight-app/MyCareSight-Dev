import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import TemplateDetailContent from '@/components/TemplateDetailContent'
import { requireAgencyCapability } from '@/lib/feature-access'
import FeatureLockedPage from '@/components/FeatureLockedPage'

export default async function AgencyNewTemplatePage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  try { await requireAgencyCapability('homesights_services') } catch {
    return <FeatureLockedPage capabilityKey="homesights_services" />
  }

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  return (
    <div className="p-4 sm:p-6">
      <TemplateDetailContent
        isAdmin={false}
        agencyId={agencyId}
        listPath="/pages/agency/templates"
      />
    </div>
  )
}
