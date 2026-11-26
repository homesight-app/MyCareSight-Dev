import 'server-only'

const connectionCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECT_TIMEOUT'])

/** Inspect fixed transport codes only, never messages, SQL, URLs or bound values. */
export function isLoginConnectionFailure(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 3) return false
  const value = error as { code?: unknown; errors?: unknown; cause?: unknown }
  if (typeof value.code === 'string' && connectionCodes.has(value.code)) return true
  if (Array.isArray(value.errors) && value.errors.length > 0) return value.errors.every(child => isLoginConnectionFailure(child, depth + 1))
  return value.cause !== undefined && isLoginConnectionFailure(value.cause, depth + 1)
}

/** Initial rate-limit SELECT only. Never wrap a password check or an authentication write. */
export async function withLoginConnectionRetry<T>(read: () => Promise<T>): Promise<T> {
  try { return await read() }
  catch (error) {
    if (!isLoginConnectionFailure(error)) throw error
    console.warn('[auth] Retrying login connection', { stage: 'initial-rate-limit-read' })
    await new Promise(resolve => setTimeout(resolve, 200))
    return read()
  }
}
