/** @jest-environment node */

import { GET } from '@/app/api/storage/branding-logo/route'
import { getSession } from '@/lib/auth'
import { getAgencyBranding } from '@/lib/supabase/query/agencies'
import { getSystemSettingsByCategory } from '@/lib/supabase/query/system-settings'
import { getSignedUrl } from '@/lib/storage/client'
import { STORAGE_BUCKET } from '@/lib/storage/contracts'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/supabase/query/agencies', () => ({ getAgencyBranding: jest.fn() }))
jest.mock('@/lib/supabase/query/system-settings', () => ({ getSystemSettingsByCategory: jest.fn() }))
jest.mock('@/lib/storage/client', () => ({ getSignedUrl: jest.fn() }))

const AGENCY_ID = '00000000-0000-4000-8000-000000000010'

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: '00000000-0000-4000-8000-000000000001' },
    profile: { role: 'company_owner', agency_id: AGENCY_ID },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(getAgencyBranding).mockResolvedValue({
    data: {
      logo_path: `${AGENCY_ID}/logo.png`,
      logo_icon_path: `${AGENCY_ID}/logo-icon.png`,
      primary_color: null,
      sidebar_color: null,
    },
    error: null,
  })
  jest.mocked(getSignedUrl).mockResolvedValue('https://storage.example.test/agency-public/logo.png?sig=synthetic')
})

test('resolves an agency logo from the authenticated profile and redirects to a private signed URL', async () => {
  const response = await GET(new Request('https://dev.example.test/api/storage/branding-logo?variant=full'))

  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toContain('sig=synthetic')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(getAgencyBranding).toHaveBeenCalledWith(AGENCY_ID)
  expect(getSignedUrl).toHaveBeenCalledWith(
    STORAGE_BUCKET.AGENCY_PUBLIC,
    `${AGENCY_ID}/logo.png`,
    300
  )
})

test('uses platform branding for platform roles', async () => {
  jest.mocked(getSession).mockResolvedValueOnce({
    user: { id: '00000000-0000-4000-8000-000000000002' },
    profile: { role: 'admin', agency_id: null },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(getSystemSettingsByCategory).mockResolvedValueOnce({
    platform_logo_path: 'platform/logo.png',
  })

  const response = await GET(new Request('https://dev.example.test/api/storage/branding-logo?variant=full'))

  expect(response.status).toBe(307)
  expect(getAgencyBranding).not.toHaveBeenCalled()
  expect(getSignedUrl).toHaveBeenCalledWith(STORAGE_BUCKET.AGENCY_PUBLIC, 'platform/logo.png', 300)
})

test('fails closed for missing sessions, invalid variants, and missing agency scope', async () => {
  jest.mocked(getSession).mockResolvedValueOnce(null)
  expect((await GET(new Request('https://dev.example.test/api/storage/branding-logo?variant=full'))).status).toBe(401)

  expect((await GET(new Request('https://dev.example.test/api/storage/branding-logo?variant=other'))).status).toBe(400)

  jest.mocked(getSession).mockResolvedValueOnce({
    user: { id: '00000000-0000-4000-8000-000000000003' },
    profile: { role: 'staff_member', agency_id: null },
  } as Awaited<ReturnType<typeof getSession>>)
  expect((await GET(new Request('https://dev.example.test/api/storage/branding-logo?variant=icon'))).status).toBe(403)
})
