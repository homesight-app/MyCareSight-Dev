/** @jest-environment node */
import { isLoginConnectionFailure, withLoginConnectionRetry } from '@/lib/auth/login-connection'
import { LOGIN_UNAVAILABLE_MESSAGE, loginFailureMessage } from '@/lib/auth/login-errors'
jest.mock('server-only', () => ({}), { virtual: true })
const connection = (code: string) => Object.assign(new Error('synthetic private details'), { code })

test('retries one initial read on a transient AggregateError and logs only a fixed stage', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const read = jest.fn().mockRejectedValueOnce(new AggregateError([connection('ETIMEDOUT'), connection('ENETUNREACH')])).mockResolvedValue('synthetic-result')
  try {
    await expect(withLoginConnectionRetry(read)).resolves.toBe('synthetic-result')
    expect(read).toHaveBeenCalledTimes(2)
    expect(warning.mock.calls).toEqual([['[auth] Retrying login connection', { stage: 'initial-rate-limit-read' }]])
  } finally { warning.mockRestore() }
})
test('stops after the second connection failure instead of looping or replaying authentication', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const error = connection('ECONNREFUSED')
  const read = jest.fn().mockRejectedValue(error)
  try {
    await expect(withLoginConnectionRetry(read)).rejects.toBe(error)
    expect(read).toHaveBeenCalledTimes(2)
  } finally { warning.mockRestore() }
})
test.each(['28P01', '42501', 'SELF_SIGNED_CERT_IN_CHAIN', '23514'])('does not retry credentials, permission, certificate or SQL failure %s', async code => {
  const error = connection(code), read = jest.fn().mockRejectedValue(error)
  await expect(withLoginConnectionRetry(read)).rejects.toBe(error)
  expect(read).toHaveBeenCalledTimes(1)
})
test('classification ignores message text and rejects mixed/empty/cyclic error trees', () => {
  expect(isLoginConnectionFailure(new Error('ECONNRESET'))).toBe(false)
  expect(isLoginConnectionFailure(new AggregateError([]))).toBe(false)
  expect(isLoginConnectionFailure(new AggregateError([connection('ETIMEDOUT'), connection('28P01')]))).toBe(false)
  const cyclic: { cause?: unknown } = {}; cyclic.cause = cyclic
  expect(isLoginConnectionFailure(cyclic)).toBe(false)
  expect(isLoginConnectionFailure({ cause: connection('ECONNRESET') })).toBe(true)
})
test.each([
  undefined, { error: 'Configuration' }, { error: 'CallbackRouteError' },
  { error: 'CredentialsSignin', code: 'temporarily_unavailable' }, { error: 'CredentialsSignin', code: 'unexpected' },
])('availability failures never claim a wrong password or reveal raw error details', result => {
  expect(loginFailureMessage(result)).toBe(LOGIN_UNAVAILABLE_MESSAGE)
})
test('only ordinary credential rejection uses the generic invalid-credentials message', () => {
  expect(loginFailureMessage({ error: 'CredentialsSignin', code: 'credentials' })).toBe('Invalid email or password. Please try again.')
  expect(loginFailureMessage({ error: 'CredentialsSignin' })).toBe('Invalid email or password. Please try again.')
})
