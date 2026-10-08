import { getSession } from '@/lib/auth'
import { getAgencyBranding } from '@/lib/supabase/query/agencies'
import { getSystemSettingsByCategory } from '@/lib/supabase/query/system-settings'
import { STORAGE_BUCKET } from '@/lib/storage/contracts'
import { getSignedUrl } from '@/lib/storage/client'

function privateResponse(body: BodyInit | null, init: ResponseInit): Response {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(body, { ...init, headers })
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return privateResponse(null, { status: 401 })

  const variant = new URL(request.url).searchParams.get('variant')
  if (variant !== 'full' && variant !== 'icon') {
    return privateResponse(null, { status: 400 })
  }

  const profile = session.profile as { role?: string | null; agency_id?: string | null } | null
  const role = profile?.role ?? null
  let path: string | null = null

  if (role === 'admin' || role === 'expert') {
    const settings = await getSystemSettingsByCategory('branding')
    path = variant === 'full'
      ? settings.platform_logo_path ?? null
      : settings.platform_logo_icon_path ?? null
  } else if (role === 'company_owner' || role === 'care_coordinator' || role === 'staff_member') {
    if (!profile?.agency_id) return privateResponse(null, { status: 403 })
    const { data, error } = await getAgencyBranding(profile.agency_id)
    if (error) return privateResponse(null, { status: 503 })
    path = variant === 'full' ? data?.logo_path ?? null : data?.logo_icon_path ?? null
  } else {
    return privateResponse(null, { status: 403 })
  }

  if (!path) return privateResponse(null, { status: 404 })

  const signedUrl = await getSignedUrl(STORAGE_BUCKET.AGENCY_PUBLIC, path, 300)
  if (!signedUrl) return privateResponse(null, { status: 503 })

  return privateResponse(null, {
    status: 307,
    headers: { Location: signedUrl },
  })
}
