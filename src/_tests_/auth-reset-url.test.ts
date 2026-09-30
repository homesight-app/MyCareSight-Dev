/** @jest-environment node */
jest.mock('server-only', () => ({}))
jest.mock('react', () => ({ cache: (fn: unknown) => fn }))
jest.mock('next/headers', () => ({ headers: jest.fn(async () => new Headers()) }))
jest.mock('@/auth', () => ({ auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendPasswordResetEmail: jest.fn() }))
jest.mock('@/lib/repositories/auth-identity', () => ({ createPasswordReset: jest.fn() }))

import { resetPassword } from '@/lib/auth'
import { getAuthOrigin } from '@/lib/auth/url'
import { sendPasswordResetEmail } from '@/lib/email'
import { createPasswordReset } from '@/lib/repositories/auth-identity'

describe('runtime password reset origin', () => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'production',
      AUTH_URL: 'https://uat.example.com',
      NEXT_PUBLIC_SITE_URL: 'https://stale.example.com',
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(createPasswordReset).mockResolvedValue({
      email: 'synthetic@example.com', token: 'synthetic-token',
    })
    jest.mocked(sendPasswordResetEmail).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('uses current AUTH_URL on every request, independent of the public build setting', async () => {
    await resetPassword('synthetic@example.com')
    expect(sendPasswordResetEmail).toHaveBeenLastCalledWith(
      'synthetic@example.com',
      'https://uat.example.com/pages/auth/reset-password#token=synthetic-token',
    )
    process.env.AUTH_URL = ' https://second.example.com/ '
    process.env.NEXT_PUBLIC_SITE_URL = ''
    await resetPassword('synthetic@example.com')
    expect(sendPasswordResetEmail).toHaveBeenLastCalledWith(
      'synthetic@example.com',
      'https://second.example.com/pages/auth/reset-password#token=synthetic-token',
    )
  })

  it.each([
    undefined, '', '   ', 'http:///', 'https:///pages', '//example.com',
    'https://', 'javascript:alert(1)', 'http://uat.example.com',
    'http://localhost:3000', 'https://user:secret@example.com',
    'https://example.com/path', 'https://example.com?token=secret',
    'https://example.com#token=secret', 'https://example.com\\path',
    '[https://example.com](https://example.com)',
  ])('rejects invalid origin %s before creating a token or consuming a reset attempt', async value => {
    if (value === undefined) delete process.env.AUTH_URL
    else process.env.AUTH_URL = value
    expect(await resetPassword('synthetic@example.com')).toEqual({
      error: 'Password reset is temporarily unavailable. Please try again later.',
    })
    expect(createPasswordReset).not.toHaveBeenCalled()
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('[resetPassword] Invalid AUTH_URL configuration')
  })

  it('allows explicit loopback HTTP only outside production', () => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'development' })
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      process.env.AUTH_URL = `http://${host}:3000`
      expect(getAuthOrigin()).toBe(`http://${host}:3000`)
    }
    process.env.AUTH_URL = 'http://uat.example.com'
    expect(() => getAuthOrigin()).toThrow('AUTH_URL')
  })

  it('keeps encoded token content in the fragment, never in the query string', async () => {
    jest.mocked(createPasswordReset).mockResolvedValue({
      email: 'synthetic@example.com', token: 'synthetic&token?/#',
    })
    await resetPassword('synthetic@example.com')
    const url = new URL(jest.mocked(sendPasswordResetEmail).mock.calls[0][1])
    expect(url.search).toBe('')
    expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe('synthetic&token?/#')
  })

  it('preserves the generic response when recovery is ineligible or rate-limited', async () => {
    jest.mocked(createPasswordReset).mockResolvedValue(null)
    expect(await resetPassword('synthetic@example.com')).toEqual({ error: null })
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })
})
