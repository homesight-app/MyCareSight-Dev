const allowedProviderCodes = new Set([
  'missing-input-secret', 'invalid-input-secret', 'missing-input-response',
  'invalid-input-response', 'bad-request', 'timeout-or-duplicate', 'internal-error',
])
const allowedTransportCodes = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET',
  'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
])

function transportCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNCLASSIFIED'
  const candidate = error as { code?: unknown; cause?: { code?: unknown } }
  const code = candidate.cause?.code ?? candidate.code
  return typeof code === 'string' && allowedTransportCodes.has(code) ? code : 'UNCLASSIFIED'
}

export async function verifyTurnstileToken(token: string, ip: string): Promise<{ success: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping verification')
    return { success: true }
  }
  let stage = 'siteverify-request'
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    })
    stage = 'siteverify-decode'
    const data: unknown = await resp.json()
    const result = data && typeof data === 'object'
      ? data as { success?: unknown; 'error-codes'?: unknown }
      : null
    if (result?.success === true) return { success: true }
    const codes = result?.['error-codes']
    // Never log provider bodies, tokens, credentials, IPs or submitted fields.
    const safeCodes = Array.isArray(codes)
      ? [...new Set(codes.map(code => typeof code === 'string' && allowedProviderCodes.has(code)
        ? code : 'UNCLASSIFIED'))].slice(0, 8)
      : []
    console.warn('Turnstile verification failed', {
      stage: 'siteverify-response',
      httpStatus: resp.status,
      codes: safeCodes.length ? safeCodes : ['UNCLASSIFIED'],
    })
    return { success: false }
  } catch (error: unknown) {
    console.warn('Turnstile verification failed', {
      stage, code: transportCode(error),
    })
    return { success: false }
  }
}
