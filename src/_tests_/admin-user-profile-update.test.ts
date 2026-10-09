/** @jest-environment node */

import sql, { withUserContext } from '@/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { updateUserProfileAction } from '@/app/actions/users'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/auth/password', () => ({ hashPassword: jest.fn() }))
jest.mock('@/lib/repositories/auth-identity', () => ({ clearLoginAccountFailures: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendInvitationEmail: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({ insertAuditLog: jest.fn() }))
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

const ACTOR_ID = '60000000-0000-4000-8000-000000000001'
const TARGET_ID = '60000000-0000-4000-8000-000000000002'
const AGENCY_ID = '60000000-0000-4000-8000-000000000003'
const mockSql = sql as unknown as jest.Mock

function statementText(firstArg: unknown): string {
  return Array.isArray(firstArg) ? firstArg.join(' ') : ''
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: ACTOR_ID },
    profile: { role: 'admin' },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(q.insertAuditLog).mockResolvedValue({ error: null })
})

test('updates the profile, domain role row, and audit inside one actor transaction', async () => {
  mockSql.mockImplementation((first: unknown) => {
    if (!Array.isArray(first)) return first
    const text = statementText(first)
    if (text.includes('FROM user_profiles') && text.includes('FOR UPDATE')) {
      return [{
        id: TARGET_ID,
        full_name: 'Synthetic Owner',
        email: 'synthetic-owner@example.invalid',
        role: 'company_owner',
        agency_id: AGENCY_ID,
      }]
    }
    if (text.includes('SELECT name FROM agencies')) return [{ name: 'Synthetic Agency' }]
    if (text.includes('UPDATE agency_admins')) return [{ id: '60000000-0000-4000-8000-000000000004' }]
    return []
  })

  await expect(updateUserProfileAction(TARGET_ID, {
    fullName: 'Updated Synthetic Owner',
  })).resolves.toEqual({ error: null, data: { success: true } })

  expect(withUserContext).toHaveBeenCalledWith(ACTOR_ID, 'admin', null, expect.any(Function))
  const statements = mockSql.mock.calls.map(call => statementText(call[0]))
  expect(statements.some(text => text.includes('UPDATE user_profiles'))).toBe(true)
  expect(statements.some(text => text.includes('UPDATE agency_admins'))).toBe(true)
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    table_name: 'user_profiles',
    record_id: TARGET_ID,
    action: 'UPDATE',
    details: { changed_fields: ['full_name'] },
  }))
  expect(JSON.stringify(jest.mocked(q.insertAuditLog).mock.calls[0]?.[0])).not.toContain('Updated Synthetic Owner')
  expect(revalidatePath).toHaveBeenCalledWith('/pages/admin/users')
})

test('returns a failure and does not revalidate when domain-role synchronization fails', async () => {
  mockSql.mockImplementation((first: unknown) => {
    if (!Array.isArray(first)) return first
    const text = statementText(first)
    if (text.includes('FROM user_profiles') && text.includes('FOR UPDATE')) {
      return [{
        id: TARGET_ID,
        full_name: 'Synthetic Owner',
        email: 'synthetic-owner@example.invalid',
        role: 'company_owner',
        agency_id: AGENCY_ID,
      }]
    }
    if (text.includes('UPDATE caregiver_members')) throw new Error('synthetic role sync failure')
    return []
  })

  await expect(updateUserProfileAction(TARGET_ID, {
    role: 'staff_member',
  })).resolves.toEqual({ error: 'synthetic role sync failure', data: null })

  expect(withUserContext).toHaveBeenCalledTimes(1)
  expect(q.insertAuditLog).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
})
