/** @jest-environment node */
import { GET } from '@/app/api/storage/download/route'
import { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { auditStoredObjectAccess, authorizeStoredObject } from '@/lib/storage/authorization'
import { downloadFile } from '@/lib/storage/client'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/db', () => ({
  __esModule: true,
  default: jest.fn(),
  withUserContext: jest.fn((_id, _role, _agencyId, operation: () => unknown) => operation()),
}))
jest.mock('@/lib/storage/authorization', () => ({
  authorizeStoredObject: jest.fn(),
  auditStoredObjectAccess: jest.fn(),
}))
jest.mock('@/lib/storage/client', () => ({ downloadFile: jest.fn() }))

const USER_ID = '00000000-0000-4000-8000-000000000001'
const RECORD_ID = '00000000-0000-4000-8000-000000000002'
const PATH = 'lead-id/generated-object-id.pdf'

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: USER_ID },
    profile: { role: 'company_owner', agency_id: '00000000-0000-4000-8000-000000000003' },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(authorizeStoredObject).mockResolvedValue({
    agencyId: '00000000-0000-4000-8000-000000000003',
    recordId: RECORD_ID,
    tableName: 'lead_documents',
    downloadFileName: 'Résumé "final".pdf',
  })
  jest.mocked(downloadFile).mockResolvedValue({
    stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close() } }),
    contentLength: 3,
    contentType: 'application/pdf',
  })
})

test('streams an authorized document with its database filename and audits the download', async () => {
  const request = new Request(
    `https://uat.example.test/api/storage/download?bucket=lead-documents&path=${encodeURIComponent(PATH)}&filename=attacker.exe`
  )
  const response = await GET(request)

  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/pdf')
  expect(response.headers.get('content-length')).toBe('3')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('content-disposition')).toBe(
    `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20_final_.pdf`
  )
  expect(response.headers.get('content-disposition')).not.toContain('attacker.exe')
  expect(authorizeStoredObject).toHaveBeenCalledWith('lead-documents', PATH)
  expect(auditStoredObjectAccess).toHaveBeenCalledWith(
    USER_ID,
    expect.objectContaining({ recordId: RECORD_ID }),
    'DOWNLOAD'
  )
  expect(withUserContext).toHaveBeenCalledTimes(2)
})

test('rejects missing authentication, invalid input, unregistered objects, and storage failures', async () => {
  jest.mocked(getSession).mockResolvedValueOnce(null)
  expect((await GET(new Request('https://uat.example.test/api/storage/download?bucket=lead-documents&path=x'))).status).toBe(401)

  expect((await GET(new Request('https://uat.example.test/api/storage/download'))).status).toBe(400)

  jest.mocked(authorizeStoredObject).mockResolvedValueOnce(null)
  expect((await GET(new Request('https://uat.example.test/api/storage/download?bucket=lead-documents&path=x'))).status).toBe(404)

  jest.mocked(downloadFile).mockResolvedValueOnce(null)
  expect((await GET(new Request('https://uat.example.test/api/storage/download?bucket=lead-documents&path=x'))).status).toBe(503)
})
