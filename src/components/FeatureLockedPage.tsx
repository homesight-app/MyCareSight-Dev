import { Lock } from 'lucide-react'
import { AGENCY_FEATURES } from '@/lib/constants/feature-keys'

interface FeatureLockedPageProps {
  featureKey: string
}

export default function FeatureLockedPage({ featureKey }: FeatureLockedPageProps) {
  const feature = AGENCY_FEATURES.find(f => f.key === featureKey)
  const label = feature?.label ?? featureKey

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-6">
        <Lock className="w-10 h-10 text-slate-400" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{label} is locked</h1>
      <p className="text-slate-500 max-w-md mb-8">
        This feature is not included in your agency&apos;s current plan. Contact your account manager to upgrade and unlock access.
      </p>
      <a
        href="mailto:support@mycaresight.com"
        className="inline-flex items-center px-6 py-2.5 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
      >
        Contact us to upgrade
      </a>
    </div>
  )
}
