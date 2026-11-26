import AgencyProgramsPage from '@/app/pages/agency/programs/page'
import { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'

const agency = '77000000-0000-4000-8000-000000000010'
const state = { inContext: false, enabled: true, role: 'company_owner' }
jest.mock('@/lib/auth', () => ({ getSession: jest.fn(async () => ({ user: { id: 'synthetic-user' }, profile: { role: state.role } })) }))
jest.mock('@/lib/agency-branches', () => ({ agencyBranchesEnabled: () => state.enabled }))
jest.mock('@/lib/feature-access', () => ({ requireAgencyCapability: jest.fn(async () => ({ userId: 'synthetic-user', role: state.role, agencyId: agency })) }))
jest.mock('@/components/AgencyProgramsContent', () => () => null)
jest.mock('@/components/FeatureLockedPage', () => () => null)
jest.mock('next/navigation', () => ({ redirect: jest.fn(() => { throw new Error('Unexpected redirect') }) }))
jest.mock('@/db', () => ({ withUserContext: jest.fn(async (_user: string, _role: string, _agency: string, read: () => Promise<unknown>) => {
  state.inContext = true
  try { return await read() } finally { state.inContext = false }
}) }))
jest.mock('@/lib/supabase/query', () => ({
  getApplicationsWithProgramsPaginated: jest.fn(async () => { expect(state.inContext).toBe(true); return { data: [], count: 0, error: null } }),
  getRequestedProgramsForAgency: jest.fn(async () => { expect(state.inContext).toBe(true); return { data: [], hasMore: false, error: null } }),
}))
beforeEach(() => { jest.clearAllMocks(); state.enabled = true; state.role = 'company_owner' })

test.each(['company_owner', 'care_coordinator'])('the %s service list and pending panel retain the same authorized agency/branch context', async role => {
  state.role = role
  const result = await AgencyProgramsPage({ searchParams: Promise.resolve({ branch: agency, q: 'Synthetic', page: '2' }) })
  expect(withUserContext).toHaveBeenCalledWith('synthetic-user', role, agency, expect.any(Function))
  expect(q.getApplicationsWithProgramsPaginated).toHaveBeenCalledWith(agency, { page: 2, pageSize: 50, search: 'Synthetic', branchId: agency })
  expect(q.getRequestedProgramsForAgency).toHaveBeenCalledWith(agency, agency)
  expect(result.props).toMatchObject({ branchesEnabled: true, branchFilter: agency, branchSelectionEnabled: role === 'company_owner' })
  expect(state.inContext).toBe(false)
})
test('feature-off keeps the filter schema unused and disables branch selection in requests', async () => {
  state.enabled = false
  const result = await AgencyProgramsPage({ searchParams: Promise.resolve({ branch: 'ignored-when-disabled' }) })
  expect(q.getApplicationsWithProgramsPaginated).toHaveBeenCalledWith(agency, expect.objectContaining({ branchId: undefined }))
  expect(result.props).toMatchObject({ branchesEnabled: false, branchFilter: '', branchSelectionEnabled: false })
})
test('invalid branch filter stops before querying agency data', async () => {
  const result = await AgencyProgramsPage({ searchParams: Promise.resolve({ branch: 'not-a-uuid' }) })
  expect(result.props.role).toBe('alert')
  expect(q.getApplicationsWithProgramsPaginated).not.toHaveBeenCalled()
})
