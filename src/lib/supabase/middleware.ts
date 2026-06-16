import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const incomingCode = request.nextUrl.searchParams.get('code')
  const incomingAccessToken = request.nextUrl.searchParams.get('access_token')
  const incomingRefreshToken = request.nextUrl.searchParams.get('refresh_token')
  const incomingType = request.nextUrl.searchParams.get('type')

  // Some auth links arrive at "/?code=..." (root) instead of "/auth/callback".
  // Normalize early in middleware so callback logic always runs.
  if (
    request.nextUrl.pathname === '/' &&
    (incomingCode || incomingAccessToken || incomingRefreshToken)
  ) {
    const callbackUrl = request.nextUrl.clone()
    callbackUrl.pathname = '/auth/callback'
    // Preserve all original query params (including custom magic-link params)
    // so callback can prefill exact credentials.
    return NextResponse.redirect(callbackUrl)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isFromCallback = request.nextUrl.searchParams.get('from_callback') === 'true'
  const path = request.nextUrl.pathname
  const isPublic =
    path === '/' ||
    path.startsWith('/pages/auth/login') ||
    path.startsWith('/pages/auth/signup') ||
    path.startsWith('/pages/auth/reset-password') ||
    path.startsWith('/auth/callback') ||
    path.startsWith('/pages/onboarding') ||
    // Legacy paths (middleware historically allowed these; keep public to avoid redirect loops)
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/reset-password') ||
    // Public contact form (iframe-embeddable on WordPress)
    path === '/contact' ||
    path.startsWith('/api/contact')

  if (!user && !isPublic && !isFromCallback) {
    const url = request.nextUrl.clone()
    url.pathname = '/pages/auth/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse
}


