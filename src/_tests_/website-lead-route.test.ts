/** @jest-environment node */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/integrations/v1/leads/route'
import { ingestWebsiteLead } from '@/lib/repositories/lead-integrations'

jest.mock('@/lib/repositories/lead-integrations', () => ({
  ingestWebsiteLead: jest.fn(),
}))

const mockIngest = ingestWebsiteLead as jest.MockedFunction<typeof ingestWebsiteLead>

const validBody = {
  firstName: 'Synthetic',
  lastName: 'Prospect',
  email: 'prospect@example.test',
  phone: '(555) 555-0100',
  serviceType: 'companion',
  message: 'Synthetic UAT submission',
  smsConsent: false,
}

function request(body: unknown = validBody, headers: Record<string, string> = {}) {
  return new NextRequest('https://uat.example.test/api/integrations/v1/leads', {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-key',
      'content-type': 'application/json',
      'idempotency-key': 'submission-1234',
      'x-forwarded-for': '192.0.2.20',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.WEBSITE_LEAD_INTEGRATION_ENABLED = 'true'
  mockIngest.mockReset()
})

afterAll(() => {
  delete process.env.WEBSITE_LEAD_INTEGRATION_ENABLED
})

test('returns 201 for a created lead without echoing submitted contact data', async () => {
  mockIngest.mockResolvedValue({ kind: 'created', leadId: '30000000-0000-4000-8000-000000000001' })
  const response = await POST(request())
  const payload = await response.json()

  expect(response.status).toBe(201)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(payload).toEqual({
    accepted: true,
    duplicate: false,
    leadId: '30000000-0000-4000-8000-000000000001',
  })
  expect(JSON.stringify(payload)).not.toContain(validBody.email)
  expect(mockIngest).toHaveBeenCalledWith(expect.objectContaining({
    apiKey: 'synthetic-key',
    idempotencyKey: 'submission-1234',
    ipAddress: '192.0.2.20',
  }))
})

test('returns the original lead for an exact retry', async () => {
  mockIngest.mockResolvedValue({ kind: 'duplicate', leadId: '30000000-0000-4000-8000-000000000002' })
  const response = await POST(request())
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ accepted: true, duplicate: true })
})

test.each([
  [{ kind: 'unauthorized' } as const, 401, 'unauthorized'],
  [{ kind: 'rate_limited' } as const, 429, 'rate_limited'],
  [{ kind: 'idempotency_conflict' } as const, 409, 'idempotency_conflict'],
  [{ kind: 'agency_unavailable' } as const, 403, 'agency_unavailable'],
])('maps repository result %o to HTTP %s', async (result, status, error) => {
  mockIngest.mockResolvedValue(result)
  const response = await POST(request())
  expect(response.status).toBe(status)
  await expect(response.json()).resolves.toEqual({ error })
})

test('rejects invalid contracts before ingestion', async () => {
  const invalidMedia = await POST(request(validBody, { 'content-type': 'text/plain' }))
  expect(invalidMedia.status).toBe(415)

  const invalidIdempotency = await POST(request(validBody, { 'idempotency-key': 'bad key' }))
  expect(invalidIdempotency.status).toBe(400)

  const unknownTenantField = await POST(request({ ...validBody, agencyId: 'attacker-selected' }))
  expect(unknownTenantField.status).toBe(400)
  expect(mockIngest).not.toHaveBeenCalled()
})

test('stays unavailable until the server-side feature switch is enabled', async () => {
  process.env.WEBSITE_LEAD_INTEGRATION_ENABLED = 'false'
  const response = await POST(request())
  expect(response.status).toBe(503)
  await expect(response.json()).resolves.toEqual({ error: 'integration_unavailable' })
  expect(mockIngest).not.toHaveBeenCalled()
})
