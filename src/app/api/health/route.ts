import { isDatabaseReachable } from '@/lib/repositories/application-health'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const healthy = await isDatabaseReachable()
  return new Response(null, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
