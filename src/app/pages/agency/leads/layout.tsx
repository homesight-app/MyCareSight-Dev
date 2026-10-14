import AgencyCapabilityLayoutGate from '@/components/AgencyCapabilityLayoutGate'

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return <AgencyCapabilityLayoutGate capability="client_management">{children}</AgencyCapabilityLayoutGate>
}
