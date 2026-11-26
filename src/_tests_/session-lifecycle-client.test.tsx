import { act, fireEvent, render, screen } from '@testing-library/react'
import { SessionLifecycle } from '@/components/SessionLifecycle'

jest.mock('next/navigation', () => ({ usePathname: () => '/pages/agency/clients' }))
const deadline = () => ({ serverNow: Date.now(), expiresAt: Date.now() + 20 * 60_000, absoluteExpiresAt: Date.now() + 8 * 60 * 60_000 })
const ok = () => ({ ok: true, status: 200, json: async () => deadline() })
const originalFetch = global.fetch
let warning: jest.SpyInstance
let fetchMock: jest.Mock
beforeEach(() => {
  jest.useFakeTimers()
  warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
  fetchMock = jest.fn().mockResolvedValue(ok())
  global.fetch = fetchMock
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { jest.useRealTimers(); warning.mockRestore(); global.fetch = originalFetch })
async function mount() {
  const result = render(<SessionLifecycle><input aria-label="Synthetic draft" /></SessionLifecycle>)
  await act(async () => {})
  return result
}
const stalled = (_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init.signal?.addEventListener('abort', () => reject(new DOMException('synthetic private failure', 'AbortError')), { once: true })
})

test('non-development startup keeps the ten-second timeout and emits only a safe classification', async () => {
  fetchMock.mockImplementationOnce(stalled)
  await mount()
  await act(async () => { jest.advanceTimersByTime(9999) })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => { jest.advanceTimersByTime(1) })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(warning.mock.calls).toEqual([['[auth] Session lifecycle check unavailable', { stage: 'timeout', method: 'GET' }]])
  await act(async () => { jest.advanceTimersByTime(60_000) })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }))
  await act(async () => {})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true)
})

test.each([
  ['network', () => Promise.reject(new Error('synthetic private provider details')), undefined],
  ['http', () => Promise.resolve({ ok: false, status: 403 }), 403],
  ['response', () => Promise.resolve({ ok: true, status: 200, json: async () => ({ private: 'never log this' }) }), 200],
])('classifies %s without raw errors, body contents, identities or credentials', async (stage, result, httpStatus) => {
  fetchMock.mockImplementationOnce(result as any)
  await mount()
  expect(screen.getByRole('heading', { name: 'Session verification unavailable' })).toBeVisible()
  expect(warning.mock.calls).toEqual([['[auth] Session lifecycle check unavailable', { stage, method: 'GET', ...(httpStatus ? { httpStatus } : {}) }]])
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('later verification keeps its ten-second budget and cleanup cancellation is silent', async () => {
  const view = await mount()
  fetchMock.mockImplementationOnce(stalled)
  fireEvent(window, new Event('focus'))
  await act(async () => { jest.advanceTimersByTime(250) })
  await act(async () => { jest.advanceTimersByTime(10_000) })
  expect(warning).toHaveBeenCalledWith('[auth] Session lifecycle check unavailable', { stage: 'timeout', method: 'GET' })
  warning.mockClear()
  fetchMock.mockImplementationOnce(stalled)
  fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }))
  await act(async () => {})
  view.unmount()
  await act(async () => {})
  expect(warning).not.toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})
