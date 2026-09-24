import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

// Preserve the former OAuth callback URL for old bookmarks and issued links.
// Authentication is handled by Auth.js; inbound requests redirect to login.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  return NextResponse.redirect(new URL('/pages/auth/login', requestUrl.origin))
}
