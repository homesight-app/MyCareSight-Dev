import AgencyLeadsPage from '@/app/pages/agency/leads/page'
import { withAuthorizedAgencyLeadListRead } from '@/lib/repositories/agency-lead-reads'
import * as q from '@/lib/supabase/query'

const agency = '73000000-0000-4000-8000-000000000002'
const state = { inContext: false }
jest.mock('@/lib/auth', () => ({ getSession: jest.fn(async () => ({ user: { id: '73000000-0000-4000-8000-000000000001' }, profile: { role: 'company_owner', agency_id: agency } })) }))
jest.mock('@/lib/feature-access', () => ({ requireAgencyCapability: jest.fn(async () => {}) }))
jest.mock('@/lib/agency-branches', () => ({ agencyBranchesEnabled: () => true }))
jest.mock('@/components/AgencyBranchFilter', () => () => null)
jest.mock('@/components/LeadsContent', () => () => null)
jest.mock('@/components/FeatureGate', () => () => null)
jest.mock('@/components/FeatureLockedPage', () => () => null)
jest.mock('next/navigation', () => ({ redirect: jest.fn(() => { throw new Error('unexpected redirect') }) }))
jest.mock('@/lib/repositories/agency-lead-reads', () => ({ withAuthorizedAgencyLeadListRead: jest.fn(async (_agency: string, read: () => Promise<unknown>) => {
  expect(state.inContext).toBe(false)
  state.inContext = true
  try { return await read() } finally { state.inContext = false }
}) }))
jest.mock('@/lib/supabase/query', () => {
  const scoped = (result: unknown) => jest.fn(async () => {
    expect(state.inContext).toBe(true)
    return result
  })
  return {
    getLeadsPaginated: scoped({ data: [{ id: '73000000-0000-4000-8000-000000000004', status: 'active', branch_id: '73000000-0000-4000-8000-000000000009', branch_name: 'Main Branch' }], count: 1 }),
    getLeadStageCounts: scoped({ active: 1 }), getLeadDistinctSources: scoped([]),
    getLeadOwnerOptions: scoped({ data: [] }), getAgencyLeadStages: scoped({ data: [] }), getLeadTaskStatusByLeadIds: scoped({ data: [] }),
  }
})

test('the actual agency list page loads its page, metadata and task summary inside one authorized context', async () => {
  await AgencyLeadsPage({ searchParams: Promise.resolve({ sortKey: 'branch_name' }) })
  expect(withAuthorizedAgencyLeadListRead).toHaveBeenCalledTimes(1)
  expect(withAuthorizedAgencyLeadListRead).toHaveBeenCalledWith(agency, expect.any(Function))
  expect(q.getLeadsPaginated).toHaveBeenCalledWith(expect.objectContaining({ agencyId: agency, leadType: 'patient', pageSize: 50, sortKey: 'branch_name' }))
  expect(q.getLeadTaskStatusByLeadIds).toHaveBeenCalledTimes(1)
  expect(state.inContext).toBe(false)
})
