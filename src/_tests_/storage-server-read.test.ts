/** @jest-environment node */
import { readAuthorizedStoredFile } from '@/lib/storage/server'
import { getSession } from '@/lib/auth'
import { authorizeStoredObject, auditStoredObjectAccess } from '@/lib/storage/authorization'
import { downloadFile } from '@/lib/storage/client'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/db', () => ({ withUserContext: jest.fn(async (_id, _role, _agency, run) => run()) }))
jest.mock('@/lib/storage/authorization', () => ({ authorizeStoredObject: jest.fn(), auditStoredObjectAccess: jest.fn() }))
jest.mock('@/lib/storage/client', () => ({ downloadFile: jest.fn() }))
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({ user: { id: 'synthetic-user' }, profile: { role: 'admin' } } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(authorizeStoredObject).mockResolvedValue({ agencyId: null, recordId: 'synthetic-record', tableName: 'application_documents' })
  jest.mocked(auditStoredObjectAccess).mockResolvedValue(undefined)
  jest.mocked(downloadFile).mockResolvedValue({ stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close() } }), contentLength: 1, contentType: null })
})

test('authorizes and commits access evidence before reading one bounded file', async () => {
  const file = await readAuthorizedStoredFile('application-documents', 'synthetic.pdf')
  expect(await new Response(file!.stream).arrayBuffer()).toEqual(new Uint8Array([1]).buffer)
  expect(downloadFile).toHaveBeenCalledWith('application-documents', 'synthetic.pdf', 50 * 1024 * 1024)
  expect(jest.mocked(auditStoredObjectAccess).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(downloadFile).mock.invocationCallOrder[0])
})

test('never reads bytes after session, record authorization or audit rejection', async () => {
  jest.mocked(getSession).mockResolvedValueOnce(null)
  expect(await readAuthorizedStoredFile('application-documents', 'synthetic.pdf')).toBeNull()
  jest.mocked(authorizeStoredObject).mockResolvedValueOnce(null)
  expect(await readAuthorizedStoredFile('application-documents', 'synthetic.pdf')).toBeNull()
  jest.mocked(auditStoredObjectAccess).mockRejectedValueOnce(new Error('synthetic-private-error'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(await readAuthorizedStoredFile('application-documents', 'synthetic.pdf')).toBeNull()
    expect(downloadFile).not.toHaveBeenCalled()
    expect(log.mock.calls).toEqual([['[storage] Read failed', { stage: 'read-audit', code: 'UNCLASSIFIED' }]])
  } finally { log.mockRestore() }
})
