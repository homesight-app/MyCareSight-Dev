/** @jest-environment node */

import { GET } from '@/app/api/health/route'
import { isDatabaseReachable } from '@/lib/repositories/application-health'

jest.mock('@/lib/repositories/application-health', () => ({ isDatabaseReachable: jest.fn() }))

test('returns a non-cacheable success without exposing database details', async () => {
  jest.mocked(isDatabaseReachable).mockResolvedValueOnce(true)
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.text()).toBe('')
})

test('returns an empty unhealthy response if the database is unavailable', async () => {
  jest.mocked(isDatabaseReachable).mockResolvedValueOnce(false)
  const response = await GET()
  expect(response.status).toBe(503)
  expect(await response.text()).toBe('')
})
