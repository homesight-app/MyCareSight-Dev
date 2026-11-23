/** @jest-environment node */
import { getConfirmedLoginDestination, LoginSessionUnavailableError } from '@/lib/auth/login-session'

const originalFetch = global.fetch
let fetchMock: jest.Mock
beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock })
afterEach(() => { global.fetch = originalFetch })

test.each([
  ['admin', '/pages/admin'], ['expert', '/pages/expert/clients'],
  ['staff_member', '/pages/caregiver'], ['care_coordinator', '/pages/agency/clients'],
  ['company_owner', '/pages/agency'],
])('routes a confirmed %s session', async (role, destination) => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'synthetic-user', role } }) })
  await expect(getConfirmedLoginDestination()).resolves.toBe(destination)
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
})

test.each([
  null, {}, { user: null }, { user: {} }, { user: { role: 'admin' } },
  { user: { id: '', role: 'admin' } }, { user: { id: 'synthetic-user' } },
  { user: { id: 'synthetic-user', role: 'unexpected' } },
  { user: { id: 'synthetic-user', role: 'toString' } },
])('rejects an unconfirmed or unknown-role session: %j', async body => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => body })
  await expect(getConfirmedLoginDestination()).rejects.toBeInstanceOf(LoginSessionUnavailableError)
})

test('does not accept an HTTP failure with a user-shaped body', async () => {
  const json = jest.fn(async () => ({ user: { id: 'synthetic-user', role: 'admin' } }))
  fetchMock.mockResolvedValue({ ok: false, json })
  await expect(getConfirmedLoginDestination()).rejects.toBeInstanceOf(LoginSessionUnavailableError)
  expect(json).not.toHaveBeenCalled()
})

test('suppresses malformed response content and preserves network failure handling', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error('synthetic-private-response') } })
  await expect(getConfirmedLoginDestination()).rejects.toThrow('We could not confirm your session.')
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(getConfirmedLoginDestination()).rejects.toThrow('Failed to fetch')
})
