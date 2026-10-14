import AgencyCapabilityLayoutGate from '@/components/AgencyCapabilityLayoutGate'

export default function CertificationsLayout({ children }: { children: React.ReactNode }) {
  return <AgencyCapabilityLayoutGate capability="agency_compliance">{children}</AgencyCapabilityLayoutGate>
}
