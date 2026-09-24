'use client'

import { useEffect, useRef } from 'react'

interface VisiblePollingOptions {
  enabled?: boolean
  intervalMs?: number
}

/** Poll while the page is visible and refresh once when the user returns. */
export function useVisiblePolling(
  callback: () => void | Promise<void>,
  { enabled = true, intervalMs = 15000 }: VisiblePollingOptions = {}
) {
  const callbackRef = useRef(callback)
  const runningRef = useRef(false)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return

    const refresh = async () => {
      if (document.visibilityState !== 'visible' || runningRef.current) return
      runningRef.current = true
      try {
        await callbackRef.current()
      } catch {
        // The owning screen handles and displays request failures.
      } finally {
        runningRef.current = false
      }
    }

    const interval = window.setInterval(refresh, intervalMs)
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    window.addEventListener('focus', refreshOnVisible)
    document.addEventListener('visibilitychange', refreshOnVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshOnVisible)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [enabled, intervalMs])
}
