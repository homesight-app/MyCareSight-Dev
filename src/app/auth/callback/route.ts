import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

// Supabase Auth OAuth callback — no longer used after Auth.js migration.
// Any inbound links redirect to the login page.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  return NextResponse.redirect(new URL('/pages/auth/login', requestUrl.origin))
}
