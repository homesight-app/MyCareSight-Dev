'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import PrimaryButton from '@/components/ui/PrimaryButton'
import { SESSION_ACTIVITY_INTERVAL_MS, SESSION_WARNING_SECONDS, type SessionDeadline } from '@/lib/auth/session-policy'

const endpoint = '/api/session/status'
// Next dev compiles this route on first use, before its database work can begin.
// Keep the normal budget for subsequent requests and every production request.
const initialCheckTimeoutMs = process.env.NODE_ENV === 'development' ? 60_000 : 10_000
type Phase = 'normal' | 'warning' | 'unavailable' | 'ending'
const protectedPath = (path: string) => /^\/pages\/(admin|expert|agency|caregiver)(\/|$)/.test(path)

export function SessionLifecycle({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Mount once across protected navigation; public/auth screens never send lifecycle requests.
  return protectedPath(pathname) ? <SessionMonitor>{children}</SessionMonitor> : children
}

function SessionMonitor({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('normal')
  const [remaining, setRemaining] = useState(0)
  const [absolute, setAbsolute] = useState(false)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const action = useRef<HTMLButtonElement>(null)
  const refresh = useRef<(activity?: boolean) => Promise<void>>(async () => {})
  const finish = useRef<() => void>(() => {})
  const currentPhase = useRef(phase)
  const absoluteWarningAcknowledged = useRef(false)
  currentPhase.current = phase

  useEffect(() => {
    let disposed = false
    let ending = false
    let deadline: SessionDeadline | null = null
    let receivedAt = 0
    let lastSent = -Infinity
    let lastInput = 0
    let pendingActivity = false
    let pending: Promise<void> | null = null
    let activeController: AbortController | null = null
    let heartbeat: ReturnType<typeof setTimeout> | undefined
    let returnTimer: ReturnType<typeof setTimeout> | undefined
    let warningCheckedFor = 0
    let expiredCheckedFor = 0
    let firstCheck = true
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('portal-session-lifecycle')
    const now = () => deadline ? deadline.serverNow + Math.max(0, Date.now() - receivedAt) : Date.now()
    const remainingMs = () => deadline ? deadline.expiresAt - now() : Infinity

    const end = (alreadyInvalid = false) => {
      if (ending || disposed) return
      ending = true
      setPhase('ending')
      clearTimeout(heartbeat)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      void fetch(endpoint, { method: 'DELETE', credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(result => {
        if (!result.ok) throw new Error('unavailable')
        channel?.postMessage('signed-out')
        window.location.replace('/pages/auth/login?message=Your%20session%20ended.%20Please%20sign%20in%20again.')
      }).catch(() => {
        if (alreadyInvalid) window.location.replace('/pages/auth/login?message=Your%20session%20ended.%20Please%20sign%20in%20again.')
        else if (!disposed) { ending = false; setPhase('unavailable') }
      }).finally(() => clearTimeout(timeout))
    }
    finish.current = () => end()
    const check = (activity = false): Promise<void> => {
      if (disposed || ending) return Promise.resolve()
      if (pending) return pending
      const controller = new AbortController()
      activeController = controller
      const timeoutMs = firstCheck ? initialCheckTimeoutMs : 10_000
      firstCheck = false
      let timedOut = false
      let failureStage: 'network' | 'http' | 'response' = 'network'
      let httpStatus: number | undefined
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
      const started = Date.now()
      if (activity) { lastSent = started; pendingActivity = false }
      setBusy(true)
      const request = Promise.resolve().then(async () => {
        if (disposed) { clearTimeout(timeout); return }
        try {
          const result = await fetch(endpoint, { method: activity ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
          if (disposed || ending) return
          if (result.status === 401) { end(true); return }
          failureStage = 'http'
          httpStatus = result.status
          if (!result.ok) throw new Error('unavailable')
          failureStage = 'response'
          const value = await result.json() as SessionDeadline
          if (![value.serverNow, value.expiresAt, value.absoluteExpiresAt].every(Number.isFinite)
            || value.expiresAt > value.absoluteExpiresAt) throw new Error('unavailable')
          deadline = value
          // Include request time conservatively rather than extending a deadline by network latency.
          receivedAt = started
          setAbsolute(value.expiresAt === value.absoluteExpiresAt)
          setRemaining(Math.max(0, Math.ceil(remainingMs() / 1000)))
          setPhase(remainingMs() <= SESSION_WARNING_SECONDS * 1000
            && !(value.expiresAt === value.absoluteExpiresAt && absoluteWarningAcknowledged.current) ? 'warning' : 'normal')
          if (activity) channel?.postMessage('activity')
        } catch {
          if (!disposed && !ending) {
            // Fixed classifications only: no URL, cookie, account, response body or raw error.
            console.warn('[auth] Session lifecycle check unavailable', {
              stage: timedOut ? 'timeout' : failureStage,
              method: activity ? 'POST' : 'GET',
              ...(httpStatus === undefined ? {} : { httpStatus }),
            })
            setPhase('unavailable')
          }
        } finally {
          clearTimeout(timeout)
          if (!disposed) setBusy(false)
        }
      }).finally(() => { pending = null })
      pending = request
      return request
    }
    refresh.current = check
    const tick = () => {
      if (!deadline || ending || disposed) return
      const left = remainingMs()
      if (left <= SESSION_WARNING_SECONDS * 1000) setRemaining(Math.max(0, Math.ceil(left / 1000)))
      if (left <= 0) {
        // Another tab may have extended this same session; block the screen while verifying.
        setPhase('unavailable')
        if (document.visibilityState === 'visible' && !pending && expiredCheckedFor !== deadline.expiresAt) {
          expiredCheckedFor = deadline.expiresAt
          void check()
        }
      } else if (left <= SESSION_WARNING_SECONDS * 1000 && currentPhase.current === 'normal') {
        if (deadline.expiresAt === deadline.absoluteExpiresAt && absoluteWarningAcknowledged.current) return
        setPhase('warning')
        if (warningCheckedFor !== deadline.expiresAt) { warningCheckedFor = deadline.expiresAt; void check() }
      }
    }
    const sendActivity = () => {
      clearTimeout(heartbeat)
      if (!pendingActivity || document.visibilityState !== 'visible' || currentPhase.current !== 'normal') return
      if (pending) { heartbeat = setTimeout(sendActivity, 1000); return }
      void check(true)
    }
    const activity = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible' || currentPhase.current !== 'normal' || !deadline) return
      if (remainingMs() <= 0) { tick(); return }
      lastInput = Date.now()
      pendingActivity = true
      clearTimeout(heartbeat)
      heartbeat = setTimeout(sendActivity, Math.max(0, SESSION_ACTIVITY_INTERVAL_MS - (lastInput - lastSent)))
    }
    const onReturn = () => {
      clearTimeout(returnTimer)
      if (document.visibilityState !== 'visible') { clearTimeout(heartbeat); return }
      // Focus is verification, not user activity. An idle/background tab cannot extend a session.
      tick()
      returnTimer = setTimeout(() => { void check() }, 250)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data === 'signed-out') { ending = true; setPhase('ending'); window.location.replace('/pages/auth/login'); return }
      if (event.data === 'activity' && document.visibilityState === 'visible') {
        clearTimeout(returnTimer)
        returnTimer = setTimeout(() => { void check() }, 250)
      }
    }
    channel?.addEventListener('message', onMessage)
    const events = ['pointerdown', 'pointermove', 'keydown', 'input', 'scroll', 'touchstart']
    for (const event of events) window.addEventListener(event, activity, { passive: true })
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    const timer = setInterval(tick, 1000) // Local countdown only; never a periodic network heartbeat.
    void check()
    return () => {
      disposed = true
      activeController?.abort()
      clearInterval(timer)
      clearTimeout(heartbeat)
      clearTimeout(returnTimer)
      channel?.close()
      for (const event of events) window.removeEventListener(event, activity)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [])

  const blocked = phase !== 'normal'
  useEffect(() => {
    const element = dialog.current
    if (blocked && element) {
      if (!element.open) element.showModal()
      if (!busy) action.current?.focus()
    }
    if (!blocked && element?.open) element.close()
  }, [blocked, busy])
  const stay = useCallback(() => { void refresh.current(true) }, [])

  return <>
    {/* Native modal supplies focus containment and inert background, unlike the current shared Modal.
        This security-specific dialog deliberately cannot dismiss to an expired editing surface. */}
    <div hidden={phase === 'ending'}>{children}</div>
    <dialog ref={dialog} aria-labelledby="session-warning-title" aria-describedby="session-warning-description"
      onCancel={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const target = event.shiftKey ? buttons.at(-1) : buttons[0]
        if ((event.shiftKey && document.activeElement === buttons[0]) || (!event.shiftKey && document.activeElement === buttons.at(-1))) {
          event.preventDefault(); target?.focus()
        }
      }}
      className="w-full max-w-lg rounded-ui-control border border-gray-200 bg-white p-6 shadow-ui-surface backdrop:bg-black/50">
      <h2 id="session-warning-title" className="text-lg font-bold text-gray-900">
        {phase === 'warning' ? 'Your session is about to end' : phase === 'ending' ? 'Signing out' : 'Session verification unavailable'}
      </h2>
      <p id="session-warning-description" className="mt-3 text-gray-600">
        {phase === 'warning' ? absolute
          ? 'Your eight-hour session limit is approaching. Save your work and sign in again.'
          : 'You have been inactive. Stay signed in to continue working, or you will be signed out. Unsaved changes will be lost.'
          : phase === 'ending' ? 'Returning to the login screen.'
          : 'We cannot confirm your session. Editing is paused. Retry when your connection is available.'}
      </p>
      {phase === 'warning' && <p className="mt-3" role="status">Time remaining: {Math.ceil(remaining / 60)} minute{Math.ceil(remaining / 60) === 1 ? '' : 's'}.</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        {phase !== 'ending' && <PrimaryButton ref={action} loading={busy} onClick={phase === 'unavailable' ? () => { void refresh.current() }
          : absolute ? () => { absoluteWarningAcknowledged.current = true; setPhase('normal') } : stay}>
          {phase === 'unavailable' ? 'Retry verification' : absolute ? 'Return to save work' : 'Stay signed in'}
        </PrimaryButton>}
        {phase !== 'ending' && <PrimaryButton variant="secondary" onClick={() => finish.current()}>Sign out</PrimaryButton>}
      </div>
    </dialog>
  </>
}
