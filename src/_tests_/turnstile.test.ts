/** @jest-environment node */
import { verifyTurnstileToken } from '@/lib/turnstile'

const originalFetch = global.fetch
const originalSecret = process.env.TURNSTILE_SECRET_KEY
let warning: jest.SpyInstance
let fetchMock: jest.Mock

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = 'synthetic-secret'
  warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
  fetchMock = jest.fn()
  global.fetch = fetchMock
})
afterEach(() => {
  global.fetch = originalFetch
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY
  else process.env.TURNSTILE_SECRET_KEY = originalSecret
  warning.mockRestore()
})

test('accepts a verified token without logging', async () => {
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ success: true }) })
  await expect(verifyTurnstileToken('synthetic-token', '192.0.2.1')).resolves.toEqual({ success: true })
  expect(warning).not.toHaveBeenCalled()
})

test.each(['invalid-input-secret', 'invalid-input-response', 'timeout-or-duplicate'])(
  'classifies %s without logging private values or provider metadata', async code => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({
      success: false, 'error-codes': [code, 'synthetic-secret'],
      hostname: 'private.example.test', token: 'synthetic-token',
    }) })
    await expect(verifyTurnstileToken('synthetic-token', '192.0.2.1')).resolves.toEqual({ success: false })
    expect(warning.mock.calls).toEqual([['Turnstile verification failed', {
      stage: 'siteverify-response', httpStatus: 200, codes: [code, 'UNCLASSIFIED'],
    }]])
  },
)

test('classifies nested TLS failure without logging the raw error', async () => {
  fetchMock.mockRejectedValue(Object.assign(new Error('synthetic-secret'), {
    cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'synthetic-token' },
  }))
  await expect(verifyTurnstileToken('synthetic-token', '192.0.2.1')).resolves.toEqual({ success: false })
  expect(warning.mock.calls).toEqual([['Turnstile verification failed', {
    stage: 'siteverify-request', code: 'SELF_SIGNED_CERT_IN_CHAIN',
  }]])
})

test('suppresses unexpected response and error values', async () => {
  fetchMock.mockResolvedValue({ status: 502, json: async () => null })
  await expect(verifyTurnstileToken('synthetic-token', '192.0.2.1')).resolves.toEqual({ success: false })
  expect(warning).toHaveBeenLastCalledWith('Turnstile verification failed', {
    stage: 'siteverify-response', httpStatus: 502, codes: ['UNCLASSIFIED'],
  })
  fetchMock.mockRejectedValue({ code: 'synthetic-secret' })
  await expect(verifyTurnstileToken('synthetic-token', '192.0.2.1')).resolves.toEqual({ success: false })
  expect(warning).toHaveBeenLastCalledWith('Turnstile verification failed', {
    stage: 'siteverify-request', code: 'UNCLASSIFIED',
  })
})

test('identifies malformed JSON without exposing the response', async () => {
  fetchMock.mockResolvedValue({ status: 502, json: async () => { throw new Error('synthetic-secret') } })
  await expect(verifyTurnstileToken('synthetic-token', '192.0.2.1')).resolves.toEqual({ success: false })
  expect(warning.mock.calls).toEqual([['Turnstile verification failed', {
    stage: 'siteverify-decode', code: 'UNCLASSIFIED',
  }]])
})
