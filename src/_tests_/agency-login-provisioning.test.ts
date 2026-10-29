/** @jest-environment node */

import sql from '@/db'
import { requirePlatformStaffOrAgencyRole } from '@/lib/permissions'
import { createPasswordReset } from '@/lib/repositories/auth-identity'
import { sendAccountSetupEmail } from '@/lib/email'
import * as q from '@/lib/supabase/query'
import { addCareCoordinatorForAgency } from '@/app/actions/agency-users'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/db', () => ({
  __esModule: true,
  default: jest.fn(),
  withUserContext: jest.fn(),
}))
jest.mock('@/lib/permissions', () => ({ requirePlatformStaffOrAgencyRole: jest.fn() }))
jest.mock('@/lib/feature-access', () => ({ getAgencyAllowedCapabilities: jest.fn() }))
jest.mock('@/lib/repositories/auth-identity', () => ({ createPasswordReset: jest.fn() }))
jest.mock('@/lib/auth/url', () => ({ getAuthOrigin: jest.fn(() => 'https://synthetic.example') }))
jest.mock('@/lib/email', () => ({ sendAccountSetupEmail: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({ insertAuditLog: jest.fn() }))
jest.mock('@/lib/ssn-crypto', () => ({
  decryptSSN: jest.fn(),
  encryptSSNWithMetadata: jest.fn(),
}))

const AGENCY_ID = '10000000-0000-4000-8000-000000000001'
const ACTOR_ID = '20000000-0000-4000-8000-000000000001'
const sqlMock = sql as unknown as jest.Mock

function queryText(first: unknown): string {
  return Array.isArray(first) ? first.join(' ') : ''
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requirePlatformStaffOrAgencyRole).mockResolvedValue({
    error: null,
    session: {
      user: { id: ACTOR_ID },
      profile: { role: 'company_owner', agency_id: AGENCY_ID },
    },
  } as Awaited<ReturnType<typeof requirePlatformStaffOrAgencyRole>>)
  jest.mocked(q.insertAuditLog).mockResolvedValue({ error: null })
  jest.mocked(createPasswordReset).mockResolvedValue({
    token: 'synthetic-one-time-token',
    email: 'coordinator@example.com',
  })
  jest.mocked(sendAccountSetupEmail).mockResolvedValue({ success: true })
})

test('requires a valid email before creating an agency login', async () => {
  await expect(addCareCoordinatorForAgency(AGENCY_ID, {
    firstName: 'Synthetic',
    lastName: 'Coordinator',
    email: '',
  })).resolves.toEqual({ error: 'Enter a valid email address' })

  expect(sql).not.toHaveBeenCalled()
  expect(createPasswordReset).not.toHaveBeenCalled()
})

test('rejects an existing email without changing the existing account', async () => {
  sqlMock.mockImplementation((first: unknown) => {
    if (queryText(first).includes('SELECT id FROM user_profiles')) {
      return Promise.resolve([{ id: 'existing-user' }])
    }
    return Promise.resolve([])
  })

  await expect(addCareCoordinatorForAgency(AGENCY_ID, {
    firstName: 'Synthetic',
    lastName: 'Coordinator',
    email: 'Existing@Example.com',
  })).resolves.toEqual({ error: 'An account with this email address already exists.' })

  const executedQueries = sqlMock.mock.calls.map(call => queryText(call[0]))
  expect(executedQueries.some(query => query.includes('UPDATE user_profiles'))).toBe(false)
  expect(createPasswordReset).not.toHaveBeenCalled()
})

test('creates a UUID-backed account without a shared password and emails a setup link', async () => {
  let profilePayload: Record<string, unknown> | undefined

  sqlMock.mockImplementation((first: unknown, ...values: unknown[]) => {
    if (!Array.isArray(first)) return first as never
    const query = queryText(first)
    if (query.includes('SELECT id FROM user_profiles')) return Promise.resolve([])
    if (query.includes('INSERT INTO user_profiles')) profilePayload = values[0] as Record<string, unknown>
    return Promise.resolve([])
  })

  await expect(addCareCoordinatorForAgency(AGENCY_ID, {
    firstName: 'Synthetic',
    lastName: 'Coordinator',
    email: 'Coordinator@Example.com',
  })).resolves.toEqual({ error: null })

  expect(profilePayload).toMatchObject({
    email: 'coordinator@example.com',
    role: 'care_coordinator',
    password_hash: null,
    agency_id: AGENCY_ID,
  })
  expect(profilePayload?.id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
  expect(createPasswordReset).toHaveBeenCalledWith({ email: 'coordinator@example.com' })
  expect(sendAccountSetupEmail).toHaveBeenCalledWith(
    'coordinator@example.com',
    'Synthetic Coordinator',
    'https://synthetic.example/pages/auth/reset-password#token=synthetic-one-time-token',
  )
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    agency_id: AGENCY_ID,
    action: 'GRANT_SYSTEM_ACCESS',
  }))
})
