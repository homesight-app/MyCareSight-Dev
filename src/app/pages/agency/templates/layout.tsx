import AgencyCapabilityLayoutGate from '@/components/AgencyCapabilityLayoutGate'

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <AgencyCapabilityLayoutGate capability="homesights_services">{children}</AgencyCapabilityLayoutGate>
}
