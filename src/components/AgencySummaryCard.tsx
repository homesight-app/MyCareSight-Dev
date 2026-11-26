import { Building2, Globe, Hash, MapPin, Users } from 'lucide-react'
import type { AgencyInfoRecord } from '@/lib/agency-branches'

type SummaryAgency = Pick<AgencyInfoRecord, 'name'> & Partial<AgencyInfoRecord>

/** Presentation only: both portals supply their already-authorized agency. */
export default function AgencySummaryCard({ agency, agencyAdmins = [], headingLevel = 1 }: {
  agency: SummaryAgency
  agencyAdmins?: { contact_name?: string | null; contact_email?: string | null }[]
  headingLevel?: 1 | 2
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  const address = [agency.physical_street_address, agency.physical_city, agency.physical_state, agency.physical_zip_code].filter(Boolean).join(', ')
  return <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
    <div className="flex items-start gap-4 mb-6">
      <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><Building2 className="w-7 h-7 text-blue-600" /></div>
      <div><Heading className="text-xl font-bold text-gray-900">{agency.name}</Heading>
        {agency.business_type && <p className="text-sm text-gray-500 mt-0.5">{agency.business_type}</p>}</div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      {agency.tax_id && <div className="flex items-start gap-2"><Hash className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div><p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tax ID</p><p className="text-gray-900">{agency.tax_id}</p></div></div>}
      {agency.website && <div className="flex items-start gap-2"><Globe className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div><p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Website</p>
          <a href={agency.website.startsWith('http') ? agency.website : `https://${agency.website}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{agency.website}</a></div></div>}
      {address && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div><p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Address</p><p className="text-gray-900">{address}</p></div></div>}
      {agencyAdmins.length > 0 && <div className="flex items-start gap-2 sm:col-span-2"><Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div><p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Agency Admins</p>
          <p className="text-gray-900">{agencyAdmins.map(a => a.contact_name || a.contact_email || 'Unknown').join(', ')}</p></div></div>}
    </div>
  </div>
}
