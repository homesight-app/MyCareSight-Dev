/** @jest-environment node */
import NextAuth from 'next-auth'
import { authenticateCredentials } from '@/lib/repositories/auth-identity'
import '@/auth'
jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next-auth', () => ({ __esModule: true, default: jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })),
  CredentialsSignin: class CredentialsSignin extends Error { code = 'credentials' } }))
jest.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: (options: unknown) => options }))
jest.mock('@/lib/repositories/auth-identity', () => ({ authenticateCredentials: jest.fn(), readOpaqueSession: jest.fn(), revokeOpaqueSession: jest.fn() }))
const config = jest.mocked(NextAuth).mock.calls[0][0] as any
const authorize = config.providers[0].authorize
const request = () => new Request('https://app.example.test/api/auth/callback/credentials')
const credentials = { email: 'synthetic@example.test', password: 'Synthetic-password-123!' }
beforeEach(() => jest.clearAllMocks())

test('a successful password check returns the same opaque identity without another login attempt', async () => {
  jest.mocked(authenticateCredentials).mockResolvedValue({ userId: 'synthetic-user', email: credentials.email, role: 'admin', fullName: null, agencyId: null, sessionToken: 'synthetic-token', expiresAt: new Date() })
  expect(await authorize(credentials, request())).toMatchObject({ id: 'synthetic-user', sessionToken: 'synthetic-token' })
  expect(authenticateCredentials).toHaveBeenCalledTimes(1)
})
test('invalid credentials remain rejected without disclosing account state', async () => {
  jest.mocked(authenticateCredentials).mockResolvedValue(null)
  expect(await authorize(credentials, request())).toBeNull()
  expect(await authorize({ email: credentials.email, password: '' }, request())).toBeNull()
  expect(authenticateCredentials).toHaveBeenCalledTimes(1)
})
test.each(['ECONNREFUSED', '23514'])('unavailable authentication emits a fixed code and no raw provider error: %s', async code => {
  const error = Object.assign(new Error('private query and parameters'), { code })
  jest.mocked(authenticateCredentials).mockRejectedValue(error)
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(authorize(credentials, request())).rejects.toMatchObject({ code: 'temporarily_unavailable' })
    try { await authorize(credentials, request()) } catch (publicError) { expect((publicError as Error).cause).toBeUndefined() }
    expect(log.mock.calls).toEqual(Array.from({ length: 2 }, () => ['[auth] Login unavailable', { stage: 'credentials', reason: code === 'ECONNREFUSED' ? 'connection' : 'verification' }]))
    expect(authenticateCredentials).toHaveBeenCalledTimes(2)
  } finally { log.mockRestore() }
})
