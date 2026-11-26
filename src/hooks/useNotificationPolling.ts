'use client'

import { useCallback, useEffect, useRef } from 'react'

export const NOTIFICATION_ACTIVE_INTERVAL_MS = 60_000
export const NOTIFICATION_IDLE_INTERVAL_MS = 120_000
export const NOTIFICATION_IDLE_AFTER_MS = 300_000
const FOCUS_COOLDOWN_MS = 15_000
const MAX_FAILURE_INTERVAL_MS = 300_000
type Kind = 'badge' | 'dropdown'

/** Read-only refresh coordination. Activity changes polling frequency, never session expiry. */
export function useNotificationPolling({ enabled, scopeKey, dropdownOpen, loadBadge, loadDropdown }: {
  enabled: boolean
  scopeKey: string
  dropdownOpen: boolean
  loadBadge: () => Promise<boolean>
  loadDropdown: () => Promise<boolean>
}) {
  const latest = useRef({ dropdownOpen, loadBadge, loadDropdown })
  latest.current = { dropdownOpen, loadBadge, loadDropdown }
  const runner = useRef<((kind: Kind) => Promise<boolean>) | null>(null)

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let lastActivity = Date.now()
    let lastCompleted = Date.now()
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let focusTimer: ReturnType<typeof setTimeout> | undefined
    const requests: Partial<Record<Kind, Promise<boolean>>> = {}
    const visible = () => document.visibilityState === 'visible'
    const interval = () => failures
      ? Math.min(MAX_FAILURE_INTERVAL_MS, NOTIFICATION_ACTIVE_INTERVAL_MS * 2 ** Math.min(failures, 3))
      : Date.now() - lastActivity >= NOTIFICATION_IDLE_AFTER_MS ? NOTIFICATION_IDLE_INTERVAL_MS : NOTIFICATION_ACTIVE_INTERVAL_MS
    const schedule = () => {
      clearTimeout(timer)
      if (disposed || !visible() || requests.badge || requests.dropdown) return
      timer = setTimeout(() => { void refresh(latest.current.dropdownOpen ? 'dropdown' : 'badge') }, Math.max(0, interval() - (Date.now() - lastCompleted)))
    }
    const refresh = (kind: Kind): Promise<boolean> => {
      if (disposed || !visible()) return Promise.resolve(false)
      const existing = requests[kind] ?? (kind === 'badge' ? requests.dropdown : undefined)
      if (existing) return existing
      clearTimeout(timer)
      const request = Promise.resolve().then(() => disposed ? false : kind === 'dropdown' ? latest.current.loadDropdown() : latest.current.loadBadge())
        .catch(() => false)
        .then(success => {
          if (!disposed) { lastCompleted = Date.now(); failures = success ? 0 : failures + 1 }
          return success
        }).finally(() => {
          delete requests[kind]
          schedule()
        })
      requests[kind] = request
      return request
    }
    runner.current = refresh
    const activity = () => {
      const wasIdle = Date.now() - lastActivity >= NOTIFICATION_IDLE_AFTER_MS
      lastActivity = Date.now()
      if (wasIdle) schedule()
    }
    const onReturn = () => {
      clearTimeout(focusTimer)
      if (!visible()) { clearTimeout(timer); return }
      activity()
      // Coalesce focus + visibility events. Bell opening always bypasses this cooldown.
      focusTimer = setTimeout(() => {
        if (Date.now() - lastCompleted >= FOCUS_COOLDOWN_MS) void refresh(latest.current.dropdownOpen ? 'dropdown' : 'badge')
        else schedule()
      }, 200)
    }
    for (const event of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(event, activity, { passive: true })
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    void refresh('badge')
    return () => {
      disposed = true
      runner.current = null
      clearTimeout(timer)
      clearTimeout(focusTimer)
      for (const event of ['pointerdown', 'keydown', 'scroll']) window.removeEventListener(event, activity)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [enabled, scopeKey])

  const refreshDropdown = useCallback(() => runner.current?.('dropdown') ?? Promise.resolve(false), [])
  useEffect(() => { if (enabled && dropdownOpen) void refreshDropdown() }, [dropdownOpen, enabled, scopeKey, refreshDropdown])
}
