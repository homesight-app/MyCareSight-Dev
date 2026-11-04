export type SessionVerificationStage = 'opaque-session' | 'current-identity'

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

