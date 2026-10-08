/** @jest-environment node */

import sql, { withUserContext } from '@/db'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'
import { updateAgencyAdminStatus } from '@/app/actions/agency-users'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendInvitationEmail: jest.fn() }))
jest.mock('@/lib/auth/password', () => ({ hashPassword: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({}))
jest.mock('@/lib/permissions', () => ({ requirePlatformStaffOrAgencyRole: jest.fn() }))
jest.mock('@/db', () => ({
  __esModule: true,
  default: jest.fn(),
  withUserContext: jest.fn(async (_userId: string, _role: string, _agencyId: string, callback: () => Promise<unknown>) => callback()),
}))

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const TARGET_ID = '40000000-0000-4000-8000-000000000002'
const AGENCY_ID = '40000000-0000-4000-8000-000000000003'
const ADMIN_ID = '40000000-0000-4000-8000-000000000004'
const mockSql = sql as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requirePlatformStaffOrAgencyRole).mockResolvedValue({
    error: null,
    session: {
      user: { id: ACTOR_ID },
      profile: { role: 'company_owner' },
      agencyRoles: [{ agency_id: AGENCY_ID, role: 'company_owner', status: 'active' }],
    },
  } as Awaited<ReturnType<typeof requirePlatformStaffOrAgencyRole>>)
})

test('deactivation updates the role record and profile, revokes sessions, and audits atomically', async () => {
  mockSql
    .mockResolvedValueOnce([{ status: 'active', user_id: TARGET_ID }])
    .mockResolvedValueOnce([{ id: ADMIN_ID }])
    .mockResolvedValueOnce([{ id: TARGET_ID }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])

  await expect(updateAgencyAdminStatus(AGENCY_ID, ADMIN_ID, 'inactive')).resolves.toEqual({ error: null })

  expect(withUserContext).toHaveBeenCalledWith(ACTOR_ID, 'company_owner', AGENCY_ID, expect.any(Function))
  const statements = mockSql.mock.calls.map(call => (call[0] as TemplateStringsArray).join(' '))
  expect(statements.some(text => text.includes('UPDATE public.agency_admins'))).toBe(true)
  expect(statements.some(text => text.includes('UPDATE public.user_profiles') && text.includes('is_active'))).toBe(true)
  expect(statements.some(text => text.includes('UPDATE public.auth_sessions') && text.includes('account_deactivated'))).toBe(true)
  expect(statements.some(text => text.includes('INSERT INTO public.audit_log'))).toBe(true)
})

test('prevents an agency user from deactivating their own account', async () => {
  mockSql.mockResolvedValueOnce([{ status: 'active', user_id: ACTOR_ID }])

  await expect(updateAgencyAdminStatus(AGENCY_ID, ADMIN_ID, 'inactive')).resolves.toEqual({
    error: 'You cannot deactivate your own account.',
  })
  expect(withUserContext).not.toHaveBeenCalled()
  expect(mockSql).toHaveBeenCalledTimes(1)
})
