/** @jest-environment node */

import { GET } from '@/app/api/storage/document-preview/route'
import { getSession } from '@/lib/auth'
import { auditStoredObjectAccess, authorizeStoredObject } from '@/lib/storage/authorization'
import { downloadFile } from '@/lib/storage/client'
import { STORAGE_BUCKET, STORAGE_UPLOAD_MAX_BYTES } from '@/lib/storage/contracts'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/storage/authorization', () => ({
  authorizeStoredObject: jest.fn(),
  auditStoredObjectAccess: jest.fn(),
}))
jest.mock('@/lib/storage/client', () => ({ downloadFile: jest.fn() }))

const SESSION = { user: { id: '00000000-0000-4000-8000-000000000001' } }
const OBJECT = {
  agencyId: '00000000-0000-4000-8000-000000000010',
  recordId: '00000000-0000-4000-8000-000000000020',
  tableName: 'application_documents',
}
const PATH = '00000000-0000-4000-8000-000000000020/synthetic.docx'
const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function body(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value))
      controller.close()
    },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue(SESSION as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(authorizeStoredObject).mockResolvedValue(OBJECT)
  jest.mocked(downloadFile).mockResolvedValue({
    stream: body('synthetic-docx'),
    contentLength: 14,
    contentType: CONTENT_TYPE,
  })
  jest.mocked(auditStoredObjectAccess).mockResolvedValue(undefined)
})

test('returns an authorized DOCX through a private same-origin response and audits the read', async () => {
  const response = await GET(new Request(`https://uat.example.test/api/storage/document-preview?path=${encodeURIComponent(PATH)}`))

  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe(CONTENT_TYPE)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  await expect(response.text()).resolves.toBe('synthetic-docx')
  expect(authorizeStoredObject).toHaveBeenCalledWith(STORAGE_BUCKET.APPLICATION, PATH)
  expect(downloadFile).toHaveBeenCalledWith(STORAGE_BUCKET.APPLICATION, PATH, STORAGE_UPLOAD_MAX_BYTES)
  expect(auditStoredObjectAccess).toHaveBeenCalledWith(SESSION.user.id, OBJECT, 'DOWNLOAD')
})

test('fails closed for unauthenticated, unsupported, and unauthorized requests', async () => {
  jest.mocked(getSession).mockResolvedValueOnce(null)
  expect((await GET(new Request(`https://uat.example.test/api/storage/document-preview?path=${PATH}`))).status).toBe(401)

  expect((await GET(new Request('https://uat.example.test/api/storage/document-preview?path=synthetic.doc'))).status).toBe(400)

  jest.mocked(authorizeStoredObject).mockResolvedValueOnce(null)
  expect((await GET(new Request(`https://uat.example.test/api/storage/document-preview?path=${PATH}`))).status).toBe(404)
  expect(downloadFile).not.toHaveBeenCalled()
})

test('rejects mismatched stored content types before returning document bytes', async () => {
  jest.mocked(downloadFile).mockResolvedValueOnce({
    stream: body('not-docx'),
    contentLength: 8,
    contentType: 'text/html',
  })

  const response = await GET(new Request(`https://uat.example.test/api/storage/document-preview?path=${PATH}`))
  expect(response.status).toBe(415)
  expect(auditStoredObjectAccess).not.toHaveBeenCalled()
})
