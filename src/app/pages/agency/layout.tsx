import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getAgencyAllowedFeatures } from '@/lib/feature-access'
import DashboardLayout from '@/components/DashboardLayout'

export default async function AgencyRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const role = (session.profile as { role?: string | null } | null)?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/auth/login')

  const agencyId = (session.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const allowedFeatures = await getAgencyAllowedFeatures(agencyId)

  return (
    <DashboardLayout
      user={{ id: session.user.id, email: session.user.email }}
      profile={session.profile}
      allowedFeatures={allowedFeatures}
    >
      {children}
    </DashboardLayout>
  )
}
