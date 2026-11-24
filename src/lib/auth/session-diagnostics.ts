export type SessionVerificationStage = 'opaque-session' | 'current-identity'

export type SessionRejectionReason = 'not-found' | 'revoked' | 'expired'
  | 'profile-unavailable' | 'profile-inactive' | 'membership-inactive' | 'unclassified'

/** Fixed classifications only; never include a token/hash or user/session identifier. */
export function reportSessionRejection(reason: SessionRejectionReason): void {
  console.warn('[auth] Session rejected', { stage: 'opaque-session', reason })
}

/**
 * Emit only a stable operational category. Never pass the original error,
 * session token, identity, route, database URL, or request metadata here.
 */
export function reportSessionVerificationFailure(stage: SessionVerificationStage): void {
  console.error(`[auth] Session datastore verification failed (${stage})`)
}

export class SessionVerificationUnavailableError extends Error {
  constructor() {
    super('Session verification is temporarily unavailable')
    this.name = 'SessionVerificationUnavailableError'
  }
}

