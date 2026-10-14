import AgencyCapabilityLayoutGate from '@/components/AgencyCapabilityLayoutGate'

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <AgencyCapabilityLayoutGate capability="analytics_reporting">{children}</AgencyCapabilityLayoutGate>
}
