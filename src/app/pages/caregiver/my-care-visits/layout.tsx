import AgencyCapabilityLayoutGate from '@/components/AgencyCapabilityLayoutGate'

export default function CaregiverVisitsLayout({ children }: { children: React.ReactNode }) {
  return <AgencyCapabilityLayoutGate capability="care_operations">{children}</AgencyCapabilityLayoutGate>
}
