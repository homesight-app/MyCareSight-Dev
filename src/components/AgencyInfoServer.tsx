import { readAgencyInfo } from '@/lib/repositories/agency-branches'
import AgencyInfoPanel from '@/components/AgencyInfoPanel'
import AgencyInfoLoader from '@/components/AgencyInfoLoader'

/** Stream one authorized agency record; never wait for unopened tabs or editors. */
export default async function AgencyInfoServer({ branchesEnabled, initialTab }: {
  branchesEnabled: boolean; initialTab: 'overview' | 'branches'
}) {
  try {
    const agency = await readAgencyInfo()
    return <AgencyInfoPanel initialAgency={agency} branchesEnabled={branchesEnabled} initialTab={initialTab} />
  } catch {
    return <AgencyInfoLoader branchesEnabled={branchesEnabled} initialTab={initialTab} initialError="Unable to load agency information. Try again." />
  }
}
