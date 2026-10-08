/** @jest-environment node */

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { hashPassword } from '@/lib/auth/password'
import { clearLoginAccountFailures } from '@/lib/repositories/auth-identity'
import { setUserPassword } from '@/app/actions/users'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/auth/password', () => ({ hashPassword: jest.fn() }))
jest.mock('@/lib/repositories/auth-identity', () => ({
  clearLoginAccountFailures: jest.fn(),
}))
jest.mock('@/lib/email', () => ({ sendInvitationEmail: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({}))
jest.mock('@/db', () => ({
  __esModule: true,
  default: jest.fn(),
  withUserContext: jest.fn(async (
    _userId: string,
    _role: string,
    _agencyId: string | null,
    callback: () => Promise<unknown>
  ) => callback()),
}))

const ACTOR_ID = '50000000-0000-4000-8000-000000000001'
const TARGET_ID = '50000000-0000-4000-8000-000000000002'
const AGENCY_ID = '50000000-0000-4000-8000-000000000003'
const SYNTHETIC_EMAIL = 'synthetic-password-reset@example.invalid'
const mockSql = sql as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: ACTOR_ID },
    profile: { role: 'admin' },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(hashPassword).mockResolvedValue('$argon2id$synthetic')
})

test('sets an eligible account password and clears only its account lockout', async () => {
  mockSql
    .mockResolvedValueOnce([{
      id: TARGET_ID,
      email: SYNTHETIC_EMAIL,
      role: 'admin',
      agency_id: null,
      is_active: true,
    }])
    .mockResolvedValueOnce([{ profile_count: 1 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])

  await expect(setUserPassword(TARGET_ID, {
    password: 'synthetic-password',
    confirmPassword: 'synthetic-password',
  })).resolves.toEqual({
    success: true,
    message: 'Password updated. The user can sign in immediately with the new password.',
  })

  expect(withUserContext).toHaveBeenCalledWith(ACTOR_ID, 'admin', null, expect.any(Function))
  expect(clearLoginAccountFailures).toHaveBeenCalledWith(SYNTHETIC_EMAIL)

  const statements = mockSql.mock.calls.map(call => (call[0] as TemplateStringsArray).join(' '))
  expect(statements.some(text => text.includes('UPDATE user_profiles') && text.includes('password_hash'))).toBe(true)
  expect(statements.some(text => text.includes('UPDATE password_reset_tokens'))).toBe(true)
  expect(statements.some(text => text.includes("'PASSWORD_RESET'"))).toBe(true)
})

test('rejects an account whose agency membership does not allow login', async () => {
  mockSql
    .mockResolvedValueOnce([{
      id: TARGET_ID,
      email: SYNTHETIC_EMAIL,
      role: 'company_owner',
      agency_id: AGENCY_ID,
      is_active: true,
    }])
    .mockResolvedValueOnce([{ profile_count: 1 }])
    .mockResolvedValueOnce([{ allows_login: false }])

  await expect(setUserPassword(TARGET_ID, {
    password: 'synthetic-password',
    confirmPassword: 'synthetic-password',
  })).resolves.toEqual({
    success: false,
    error: 'This account does not have an active matching agency membership. Correct its role and agency access before setting a password.',
  })

  expect(clearLoginAccountFailures).not.toHaveBeenCalled()
  expect(mockSql).toHaveBeenCalledTimes(3)
})

test('allows an active agency manager to reset a user only through the agency-scoped query', async () => {
  jest.mocked(getSession).mockResolvedValueOnce({
    user: { id: ACTOR_ID },
    profile: { role: 'care_coordinator', agency_id: AGENCY_ID },
    agencyRoles: [{ agency_id: AGENCY_ID, role: 'care_coordinator', status: 'active' }],
  } as Awaited<ReturnType<typeof getSession>>)
  mockSql
    .mockResolvedValueOnce([{
      id: TARGET_ID,
      email: SYNTHETIC_EMAIL,
      role: 'staff_member',
      agency_id: AGENCY_ID,
      is_active: true,
    }])
    .mockResolvedValueOnce([{ profile_count: 1 }])
    .mockResolvedValueOnce([{ allows_login: true }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])

  await expect(setUserPassword(TARGET_ID, {
    password: 'synthetic-password',
    confirmPassword: 'synthetic-password',
  }, AGENCY_ID)).resolves.toEqual({
    success: true,
    message: 'Password updated. The user can sign in immediately with the new password.',
  })

  expect(withUserContext).toHaveBeenCalledWith(
    ACTOR_ID,
    'care_coordinator',
    AGENCY_ID,
    expect.any(Function)
  )
  const targetLookup = (mockSql.mock.calls[0][0] as TemplateStringsArray).join(' ')
  expect(targetLookup).toContain('AND agency_id =')
  expect(targetLookup).toContain("role IN ('company_owner', 'care_coordinator', 'staff_member')")
})

test('rejects an agency manager attempting a reset outside their active agency', async () => {
  jest.mocked(getSession).mockResolvedValueOnce({
    user: { id: ACTOR_ID },
    profile: { role: 'company_owner', agency_id: AGENCY_ID },
    agencyRoles: [{ agency_id: AGENCY_ID, role: 'company_owner', status: 'active' }],
  } as Awaited<ReturnType<typeof getSession>>)

  await expect(setUserPassword(TARGET_ID, {
    password: 'synthetic-password',
    confirmPassword: 'synthetic-password',
  }, '50000000-0000-4000-8000-000000000099')).resolves.toEqual({
    success: false,
    error: 'Forbidden',
  })

  expect(hashPassword).not.toHaveBeenCalled()
  expect(withUserContext).not.toHaveBeenCalled()
  expect(mockSql).not.toHaveBeenCalled()
})

test('rejects a platform expert even if a stale agency membership is present', async () => {
  jest.mocked(getSession).mockResolvedValueOnce({
    user: { id: ACTOR_ID },
    profile: { role: 'expert', agency_id: null },
    agencyRoles: [{ agency_id: AGENCY_ID, role: 'company_owner', status: 'active' }],
  } as Awaited<ReturnType<typeof getSession>>)

  await expect(setUserPassword(TARGET_ID, {
    password: 'synthetic-password',
    confirmPassword: 'synthetic-password',
  }, AGENCY_ID)).resolves.toEqual({
    success: false,
    error: 'Forbidden',
  })

  expect(hashPassword).not.toHaveBeenCalled()
  expect(withUserContext).not.toHaveBeenCalled()
  expect(mockSql).not.toHaveBeenCalled()
})

test('rejects a password that does not meet the shared policy before database access', async () => {
  await expect(setUserPassword(TARGET_ID, {
    password: 'short',
    confirmPassword: 'short',
  })).resolves.toEqual(expect.objectContaining({
    success: false,
    fieldErrors: { password: ['Password must be at least 8 characters'] },
  }))

  expect(hashPassword).not.toHaveBeenCalled()
  expect(withUserContext).not.toHaveBeenCalled()
  expect(mockSql).not.toHaveBeenCalled()
})

