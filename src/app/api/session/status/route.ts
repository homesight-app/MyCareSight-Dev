import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@auth/core/jwt'
import { getSessionRequestContext } from '@/lib/auth/url'
import { readOpaqueSession, recordOpaqueSessionActivity, revokeOpaqueSession } from '@/lib/repositories/auth-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' }

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

async function handle(request: NextRequest, mode: 'read' | 'activity' | 'logout') {
  let stage: 'configuration' | 'cookie' | 'session-read' | 'activity-write' | 'logout' | 'deadline-response' = 'configuration'
  try {
    const { origin, secureCookie: secure } = getSessionRequestContext(request)
    if (mode !== 'read' && (request.headers.get('origin') !== origin
      || request.headers.get('sec-fetch-site') === 'cross-site')) {
      return response({ status: 'forbidden', stage: 'origin' }, 403)
    }
    // Cookie only: this browser lifecycle endpoint never accepts a bearer token or body identity.
    const cookieName = (secure ? '__Secure-' : '') + 'authjs.session-token'
    stage = 'cookie'
    const token = await getToken({ req: { headers: new Headers({ cookie: request.headers.get('cookie') ?? '' }) }, raw: true, secureCookie: secure })
    if (mode === 'logout') {
      stage = 'logout'
      if (token) await revokeOpaqueSession(token, 'portal_logout')
      const result = response({ status: 'signed-out' })
      result.cookies.set(cookieName, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 })
      return result
    }
    stage = mode === 'activity' ? 'activity-write' : 'session-read'
    const identity = token ? await (mode === 'activity' ? recordOpaqueSessionActivity(token) : readOpaqueSession(token)) : null
    if (!identity) return response({ status: 'expired' }, 401)
    stage = 'deadline-response'
    return response({
      serverNow: identity.serverNow!.getTime(),
      expiresAt: identity.expiresAt.getTime(),
      absoluteExpiresAt: identity.absoluteExpiresAt!.getTime(),
    })
  } catch {
    console.error('[auth] Session lifecycle unavailable', { stage })
    // Unlike Auth.js's null-session fallback, this distinguishes an outage from expiration.
    return response({ status: 'unavailable', stage }, 503)
  }
}

export async function GET(request: NextRequest) { return handle(request, 'read') }
export async function POST(request: NextRequest) { return handle(request, 'activity') }
export async function DELETE(request: NextRequest) { return handle(request, 'logout') }
