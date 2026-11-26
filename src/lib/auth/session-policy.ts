/** Shared display policy. Enforcement uses server time and the opaque session row. */
export const SESSION_IDLE_SECONDS = 20 * 60
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60
export const SESSION_WARNING_SECONDS = 5 * 60
export const SESSION_ACTIVITY_INTERVAL_MS = 60_000

export type SessionDeadline = {
  serverNow: number
  expiresAt: number
  absoluteExpiresAt: number
}
