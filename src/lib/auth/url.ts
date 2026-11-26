import 'server-only'

/** Read per request: public environment variables are frozen by next build. */
export function getAuthOrigin(): string {
  const configured = process.env.AUTH_URL?.trim() ?? ''
  return validateAuthOrigin(configured)
}

function validateAuthOrigin(configured: string): string {
  const invalid = () => new Error('AUTH_URL must be a valid HTTPS application origin')

  // Reject paths, credentials, and URL parser repairs such as https:///host.
  if (!/^https?:\/\/[^/\s\\?#]+\/?$/i.test(configured)) throw invalid()

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw invalid()
  }

  const localHttp = process.env.NODE_ENV !== 'production'
    && url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)

  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password) {
    throw invalid()
  }

  return url.origin
}

/** Validate the actual development origin without changing Auth.js cookie selection. */
export function getSessionRequestContext(request: Request): { origin: string; secureCookie: boolean } {
  if (process.env.NODE_ENV !== 'development') {
    const origin = getAuthOrigin()
    return { origin, secureCookie: origin.startsWith('https:') }
  }
  // Auth.js can infer a local URL, or use AUTH_URL/NEXTAUTH_URL to choose its cookie.
  // An explicitly invalid setting must still fail instead of being bypassed.
  const configured = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim()
  const canonical = configured ? validateAuthOrigin(configured) : null
  const url = new URL(request.url)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !['http:', 'https:'].includes(url.protocol)) {
    const origin = canonical ?? getAuthOrigin()
    return { origin, secureCookie: origin.startsWith('https:') }
  }
  // NextRequest normalizes loopback IP URLs to localhost. Preserve the actual
  // loopback Host so a browser's Origin still matches on IPv4/IPv6 development URLs.
  const host = request.headers.get('host')
  if (host) {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) throw new Error('Invalid local request host')
    url.host = host
  }
  return { origin: url.origin, secureCookie: (canonical ?? url.origin).startsWith('https:') }
}
