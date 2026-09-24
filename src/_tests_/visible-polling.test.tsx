import { act, renderHook } from '@testing-library/react'
import { useVisiblePolling } from '@/hooks/useVisiblePolling'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

test('polls only while visible, refreshes on return, and cleans up', async () => {
  jest.useFakeTimers()
  setVisibility('visible')
  const refresh = jest.fn(async () => {})
  const { unmount } = renderHook(() => useVisiblePolling(refresh, { intervalMs: 1000 }))

  await act(async () => {
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
  })
  expect(refresh).toHaveBeenCalledTimes(1)

  setVisibility('hidden')
  await act(async () => {
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
  })
  expect(refresh).toHaveBeenCalledTimes(1)

  setVisibility('visible')
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
  })
  expect(refresh).toHaveBeenCalledTimes(2)

  unmount()
  await act(async () => {
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
  })
  expect(refresh).toHaveBeenCalledTimes(2)
  jest.useRealTimers()
})
