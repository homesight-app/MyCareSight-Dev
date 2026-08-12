import { getAgencyAllowedFeatures } from '@/lib/feature-access'
import FeatureLockedPage from './FeatureLockedPage'

interface FeatureGateProps {
  feature: string
  agencyId: string | null
  children: React.ReactNode
}

/**
 * Server component that blocks access to a page when the agency's plan
 * does not include the specified feature key.
 * null agencyId or no plan assigned = unrestricted (renders children).
 */
export default async function FeatureGate({ feature, agencyId, children }: FeatureGateProps) {
  const allowed = await getAgencyAllowedFeatures(agencyId)
  if (allowed !== null && !allowed.includes(feature)) {
    return <FeatureLockedPage featureKey={feature} />
  }
  return <>{children}</>
}
