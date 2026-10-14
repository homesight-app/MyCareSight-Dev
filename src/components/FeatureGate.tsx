import { getAgencyAllowedCapabilities } from '@/lib/feature-access'
import FeatureLockedPage from './FeatureLockedPage'
import type { CapabilityKey } from '@/lib/constants/feature-keys'

interface FeatureGateProps {
  capability: CapabilityKey
  agencyId: string | null
  children: React.ReactNode
}

/**
 * Server component that blocks access to a page when the agency's plan
 * does not include the specified business capability.
 */
export default async function FeatureGate({ capability, agencyId, children }: FeatureGateProps) {
  const allowed = await getAgencyAllowedCapabilities(agencyId)
  if (!allowed.includes(capability)) {
    return <FeatureLockedPage capabilityKey={capability} />
  }
  return <>{children}</>
}
