import AgencyCapabilityLayoutGate from '@/components/AgencyCapabilityLayoutGate'

export default function CaregiverManagementLayout({ children }: { children: React.ReactNode }) {
  return <AgencyCapabilityLayoutGate capability="caregiver_management">{children}</AgencyCapabilityLayoutGate>
}
