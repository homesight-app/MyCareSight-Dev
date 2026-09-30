import 'server-only'

/** Read per request: public environment variables are frozen by next build. */
export function getAuthOrigin(): string {
  const configured = process.env.AUTH_URL?.trim() ?? ''
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
