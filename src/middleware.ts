export { auth as middleware } from '@/auth'

export const runtime = 'nodejs'

export const config = {
  matcher: [
    // These routes authenticate independently. Upload avoids cloning large bodies;
    // lifecycle status preserves its explicit 503 versus 401 distinction on outages.
    '/((?!api/storage/upload|api/session/status|_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.webp).*)',
  ],
}
