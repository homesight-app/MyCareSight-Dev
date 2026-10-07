export { auth as middleware } from '@/auth'

export const runtime = 'nodejs'

export const config = {
  matcher: [
    // The upload route authenticates its own session. Bypassing middleware
    // prevents Next.js from cloning large multipart bodies before the route.
    '/((?!api/storage/upload|_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.webp).*)',
  ],
}
