import AgencyCapabilityLayoutGate from '@/components/AgencyCapabilityLayoutGate'

export default function CareVisitsLayout({ children }: { children: React.ReactNode }) {
  return <AgencyCapabilityLayoutGate capability="care_operations">{children}</AgencyCapabilityLayoutGate>
}
