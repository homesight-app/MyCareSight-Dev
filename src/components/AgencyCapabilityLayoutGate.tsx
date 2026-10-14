import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import type { CapabilityKey } from '@/lib/constants/feature-keys'
import FeatureGate from '@/components/FeatureGate'

export default async function AgencyCapabilityLayoutGate({
  capability,
  children,
}: {
  capability: CapabilityKey
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  return (
    <FeatureGate capability={capability} agencyId={session.profile?.agency_id ?? null}>
      {children}
    </FeatureGate>
  )
}
