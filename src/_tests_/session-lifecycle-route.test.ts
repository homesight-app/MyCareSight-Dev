/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getToken } from '@auth/core/jwt'
import { GET, POST, DELETE } from '@/app/api/session/status/route'
import { readOpaqueSession, recordOpaqueSessionActivity, revokeOpaqueSession } from '@/lib/repositories/auth-identity'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@auth/core/jwt', () => ({ getToken: jest.fn() }))
jest.mock('@/lib/repositories/auth-identity', () => ({ readOpaqueSession: jest.fn(), recordOpaqueSessionActivity: jest.fn(), revokeOpaqueSession: jest.fn() }))
const previousOrigin = process.env.AUTH_URL
const deadline = { sessionToken: 'synthetic-cookie', userId: 'synthetic-user', email: 'synthetic@example.test', role: 'admin' as const,
  agencyId: null, fullName: null, serverNow: new Date('2026-01-01T00:00:00Z'), expiresAt: new Date('2026-01-01T00:20:00Z'), absoluteExpiresAt: new Date('2026-01-01T08:00:00Z') }
function request(method: string, origin: string | null = 'https://app.example.test') {
  return new NextRequest('https://app.example.test/api/session/status', { method,
    headers: { ...(origin ? { origin } : {}), cookie: '__Secure-authjs.session-token=synthetic-cookie', authorization: 'Bearer ignored' } })
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.AUTH_URL = 'https://app.example.test'
  jest.mocked(getToken).mockResolvedValue('synthetic-cookie' as never)
  jest.mocked(readOpaqueSession).mockResolvedValue(deadline)
  jest.mocked(recordOpaqueSessionActivity).mockResolvedValue(deadline)
  jest.mocked(revokeOpaqueSession).mockResolvedValue()
})
afterAll(() => { if (previousOrigin === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = previousOrigin })

test('read returns only authoritative deadline metadata, no identity or token, and never renews', async () => {
  const result = await GET(request('GET', null))
  expect(result.status).toBe(200)
  expect(result.headers.get('cache-control')).toContain('no-store')
  expect(await result.json()).toEqual({ serverNow: deadline.serverNow.getTime(), expiresAt: deadline.expiresAt.getTime(), absoluteExpiresAt: deadline.absoluteExpiresAt.getTime() })
  expect(recordOpaqueSessionActivity).not.toHaveBeenCalled()
  const tokenOptions = jest.mocked(getToken).mock.calls[0][0]
  expect((tokenOptions.req!.headers as Headers).get('authorization')).toBeNull()
})
test('same-origin explicit activity uses the cookie identity', async () => {
  expect((await POST(request('POST'))).status).toBe(200)
  expect(recordOpaqueSessionActivity).toHaveBeenCalledWith('synthetic-cookie')
  expect(readOpaqueSession).not.toHaveBeenCalled()
})
test.each([null, 'https://foreign.example.test'])('rejects untrusted activity and logout origins: %s', async origin => {
  expect((await POST(request('POST', origin))).status).toBe(403)
  expect((await DELETE(request('DELETE', origin))).status).toBe(403)
  expect(getToken).not.toHaveBeenCalled()
})
test('rejects cross-site metadata even when Origin claims the canonical host', async () => {
  const value = request('POST'); value.headers.set('sec-fetch-site', 'cross-site')
  expect((await POST(value)).status).toBe(403)
})
test('expired or missing cookies return 401 without an extension', async () => {
  jest.mocked(readOpaqueSession).mockResolvedValue(null)
  jest.mocked(recordOpaqueSessionActivity).mockResolvedValue(null)
  expect((await GET(request('GET'))).status).toBe(401)
  expect((await POST(request('POST'))).status).toBe(401)
  jest.mocked(getToken).mockResolvedValue(null)
  expect((await POST(request('POST'))).status).toBe(401)
  expect(recordOpaqueSessionActivity).toHaveBeenCalledTimes(1)
})
test('provider failures return 503 and log only a fixed classification', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.mocked(readOpaqueSession).mockRejectedValue(new Error('synthetic-private-value'))
  const result = await GET(request('GET'))
  expect(result.status).toBe(503)
  expect(await result.json()).toEqual({ status: 'unavailable' })
  expect(error.mock.calls).toEqual([['[auth] Session datastore verification failed (opaque-session)']])
  error.mockRestore()
})
test('sign-out revokes the same session and expires the HttpOnly cookie', async () => {
  const result = await DELETE(request('DELETE'))
  expect(result.status).toBe(200)
  expect(revokeOpaqueSession).toHaveBeenCalledWith('synthetic-cookie', 'portal_logout')
  expect(result.headers.get('set-cookie')).toContain('__Secure-authjs.session-token=;')
  expect(result.headers.get('set-cookie')).toContain('Max-Age=0')
})
