/** @jest-environment jsdom */
import { resolveDocumentViewUrl, STORAGE_BUCKET } from '@/lib/storage'

const originalFetch = global.fetch
const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
})
afterAll(() => { global.fetch = originalFetch })

test.each([
  'templates/synthetic.pdf',
  'https://legacy.example.test/storage/v1/object/public/license-templates/templates/synthetic.pdf',
])('resolves stored references using only the authorized application endpoint: %s', async reference => {
  const azureUrl = 'https://synthetic.blob.core.windows.net/license-templates/templates/synthetic.pdf?synthetic-sas'
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: azureUrl }) })
  expect(await resolveDocumentViewUrl(STORAGE_BUCKET.LICENSE_TEMPLATES, reference)).toBe(azureUrl)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/storage/signed-url?${new URLSearchParams({ bucket: STORAGE_BUCKET.LICENSE_TEMPLATES, path: reference, expiresIn: '600' })}`,
    { cache: 'no-store' }
  )
})

test('preserves intentional external links without fetching them', async () => {
  const reference = 'https://authority.example.test/public/forms/synthetic.pdf'
  expect(await resolveDocumentViewUrl(STORAGE_BUCKET.LICENSE_TEMPLATES, reference)).toBe(reference)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('preserves the existing document-preview expiry request', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://synthetic.example.test/view' }) })
  await resolveDocumentViewUrl(STORAGE_BUCKET.APPLICATION, 'synthetic.pdf', 3600)
  expect(new URL(fetchMock.mock.calls[0][0], 'https://app.example.test').searchParams.get('expiresIn')).toBe('3600')
})

test('never falls back to a legacy source URL after denied authorization or signing failure', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404 })
  const reference = 'https://legacy.example.test/storage/v1/object/public/license-templates/synthetic.pdf'
  expect(await resolveDocumentViewUrl(STORAGE_BUCKET.LICENSE_TEMPLATES, reference)).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('rejects empty, malformed and unsupported retired-provider links', async () => {
  expect(await resolveDocumentViewUrl(STORAGE_BUCKET.LICENSE_TEMPLATES, '')).toBeNull()
  expect(await resolveDocumentViewUrl(STORAGE_BUCKET.LICENSE_TEMPLATES, 'https://[')).toBeNull()
  expect(await resolveDocumentViewUrl(STORAGE_BUCKET.LICENSE_TEMPLATES, 'https://synthetic.supabase.co/unsupported'))
    .toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})
