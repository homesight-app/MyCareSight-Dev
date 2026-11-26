import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useNotificationPolling } from '@/hooks/useNotificationPolling'

let visibility: DocumentVisibilityState
let previousVisibility: PropertyDescriptor | undefined
function Probe(props: Parameters<typeof useNotificationPolling>[0]) { useNotificationPolling(props); return null }
function inputs() { return { enabled: true, scopeKey: 'synthetic-user:admin', dropdownOpen: false,
  loadBadge: jest.fn<Promise<boolean>, []>().mockResolvedValue(true), loadDropdown: jest.fn<Promise<boolean>, []>().mockResolvedValue(true) } }
async function advance(ms = 0) { await act(async () => { await jest.advanceTimersByTimeAsync(ms) }) }

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(0)
  visibility = 'visible'
  previousVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => {
  cleanup()
  jest.clearAllTimers()
  jest.useRealTimers()
  if (previousVisibility) Object.defineProperty(document, 'visibilityState', previousVisibility)
  else delete (document as unknown as Record<string, unknown>).visibilityState
})

test('active users get one initial badge and one read per minute, not every thirty seconds', async () => {
  const value = inputs()
  render(<Probe {...value} />)
  await advance()
  expect(value.loadBadge).toHaveBeenCalledTimes(1)
  await advance(30000)
  expect(value.loadBadge).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(window)
  await advance(30000)
  expect(value.loadBadge).toHaveBeenCalledTimes(2)
  await advance(60000)
  expect(value.loadBadge).toHaveBeenCalledTimes(3)
  expect(value.loadDropdown).not.toHaveBeenCalled()
})

test('five minutes without interaction backs off to two-minute reads and activity restores cadence', async () => {
  const value = inputs()
  render(<Probe {...value} />)
  await advance(300000)
  expect(value.loadBadge).toHaveBeenCalledTimes(6)
  await advance(60000)
  expect(value.loadBadge).toHaveBeenCalledTimes(6)
  fireEvent.pointerDown(window)
  await advance()
  expect(value.loadBadge).toHaveBeenCalledTimes(7)
  await advance(60000)
  expect(value.loadBadge).toHaveBeenCalledTimes(8)
})

test('hidden tabs do no new reads; focus and visibility return coalesce into one fresh read', async () => {
  const value = inputs()
  render(<Probe {...value} />)
  await advance()
  visibility = 'hidden'
  fireEvent(document, new Event('visibilitychange'))
  await advance(180000)
  expect(value.loadBadge).toHaveBeenCalledTimes(1)
  visibility = 'visible'
  fireEvent(document, new Event('visibilitychange'))
  fireEvent.focus(window)
  await advance(201)
  expect(value.loadBadge).toHaveBeenCalledTimes(2)
  fireEvent.focus(window)
  fireEvent(document, new Event('visibilitychange'))
  await advance(201)
  expect(value.loadBadge).toHaveBeenCalledTimes(2)
})

test('opening the bell reads the full list immediately even during the focus cooldown', async () => {
  const value = inputs()
  const view = render(<Probe {...value} />)
  await advance()
  view.rerender(<Probe {...value} dropdownOpen />)
  await advance()
  expect(value.loadDropdown).toHaveBeenCalledTimes(1)
  await advance(60000)
  expect(value.loadDropdown).toHaveBeenCalledTimes(2)
  expect(value.loadBadge).toHaveBeenCalledTimes(1)
})

test('slow requests never overlap with timer or focus refreshes', async () => {
  let finish!: (success: boolean) => void
  const value = inputs()
  value.loadBadge.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<Probe {...value} />)
  await advance(120000)
  fireEvent.focus(window)
  await advance(201)
  expect(value.loadBadge).toHaveBeenCalledTimes(1)
  await act(async () => { finish(true) })
  await advance(60000)
  expect(value.loadBadge).toHaveBeenCalledTimes(2)
})

test('failed reads back off and a successful response restores the active interval', async () => {
  const value = inputs()
  value.loadBadge.mockResolvedValueOnce(false).mockResolvedValueOnce(false)
  render(<Probe {...value} />)
  await advance(60000)
  expect(value.loadBadge).toHaveBeenCalledTimes(1)
  await advance(60000)
  expect(value.loadBadge).toHaveBeenCalledTimes(2)
  await advance(240000)
  expect(value.loadBadge).toHaveBeenCalledTimes(3)
  fireEvent.keyDown(window)
  await advance(60000)
  expect(value.loadBadge).toHaveBeenCalledTimes(4)
})

test('scope changes/unmount cancel old timers and disabled consumers do no reads', async () => {
  const value = inputs()
  const view = render(<Probe {...value} />)
  await advance()
  view.rerender(<Probe {...value} scopeKey="synthetic-other:expert" />)
  await advance()
  expect(value.loadBadge).toHaveBeenCalledTimes(2)
  view.rerender(<Probe {...value} enabled={false} />)
  await advance(600000)
  expect(value.loadBadge).toHaveBeenCalledTimes(2)
  view.unmount()
  expect(jest.getTimerCount()).toBe(0)
})

test('Strict Mode cleanup avoids queued duplicate reads', async () => {
  const value = inputs()
  render(<StrictMode><Probe {...value} /></StrictMode>)
  await advance()
  expect(value.loadBadge).toHaveBeenCalledTimes(1)
})
