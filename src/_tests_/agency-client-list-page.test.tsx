import ClientsPage from '@/app/pages/agency/clients/page'
import * as q from '@/lib/supabase/query'
import { withUserContext } from '@/db'

const agency = '76000000-0000-4000-8000-000000000010'
const state = { inContext: false, branchesEnabled: true }
jest.mock('@/lib/auth', () => ({ getSession: jest.fn(async () => ({ user: { id: 'synthetic-owner' }, profile: { role: 'company_owner', agency_id: agency } })) }))
jest.mock('@/lib/feature-access', () => ({ requireAgencyCapability: jest.fn(async () => {}) }))
jest.mock('@/lib/agency-branches', () => ({ agencyBranchesEnabled: () => state.branchesEnabled }))
jest.mock('@/components/ClientsContent', () => () => null)
jest.mock('@/components/FeatureGate', () => () => null)
jest.mock('@/components/FeatureLockedPage', () => () => null)
jest.mock('next/navigation', () => ({ redirect: jest.fn(() => { throw new Error('unexpected redirect') }) }))
jest.mock('@/db', () => ({ withUserContext: jest.fn(async (_user: string, _role: string, _agency: string, read: () => Promise<unknown>) => {
  expect(state.inContext).toBe(false)
  state.inContext = true
  try { return await read() } finally { state.inContext = false }
}) }))
jest.mock('@/lib/supabase/query', () => ({
  getPatientsByAgencyId: jest.fn(async () => { expect(state.inContext).toBe(true); return { data: [], count: 0, error: null } }),
  getPatientCountsByAgencyId: jest.fn(async () => { expect(state.inContext).toBe(true); return { active: 0, total: 0 } }),
}))
beforeEach(() => { jest.clearAllMocks(); state.branchesEnabled = true })

test('the client page keeps authorized context and bounded server sort/filter/page inputs', async () => {
  const result = await ClientsPage({ searchParams: Promise.resolve({ branch: agency, status: 'all', q: 'synthetic', sortKey: 'branch_name', sortDir: 'asc', page: '2' }) })
  expect(withUserContext).toHaveBeenCalledWith('synthetic-owner', 'company_owner', agency, expect.any(Function))
  expect(q.getPatientsByAgencyId).toHaveBeenCalledWith(agency, { page: 2, pageSize: 50, search: 'synthetic', status: 'all', branchId: agency, sortKey: 'branch_name', sortDir: 'asc' })
  expect(result.props.children.props).toMatchObject({ branchesEnabled: true, branchFilter: agency, sortKey: 'branch_name', sortDir: 'asc' })
  expect(state.inContext).toBe(false)
})
test.each(['unexpected;SQL', 'branch_name'])('feature-off/invalid sort=%s safely falls back without schema use', async sortKey => {
  state.branchesEnabled = false
  await ClientsPage({ searchParams: Promise.resolve({ sortKey, sortDir: 'unsafe', branch: 'ignored-when-disabled' }) })
  expect(q.getPatientsByAgencyId).toHaveBeenCalledWith(agency, expect.objectContaining({ branchId: undefined, pageSize: 50, sortKey: 'created_at', sortDir: 'desc' }))
})
test('invalid branch filter returns local feedback before any patient reads', async () => {
  const result = await ClientsPage({ searchParams: Promise.resolve({ branch: 'not-a-uuid' }) })
  expect(result.props.role).toBe('alert')
  expect(q.getPatientsByAgencyId).not.toHaveBeenCalled()
})
