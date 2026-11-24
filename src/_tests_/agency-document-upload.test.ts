/** @jest-environment node */
import { commitAgencyDocumentUploadAction } from '@/app/actions/agency-documents'
import { POST } from '@/app/api/storage/upload/route'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import { authorizeStorageUpload } from '@/lib/storage/authorization'
import { uploadFile } from '@/lib/storage/client'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/db', () => ({ withUserContext: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({ insertAgencyDocument: jest.fn(), insertAuditLog: jest.fn() }))
jest.mock('@/lib/storage/cleanup-token', () => ({ readStorageCleanupToken: jest.fn(), createStorageCleanupToken: jest.fn(() => 'synthetic-token') }))
jest.mock('@/lib/storage/authorization', () => ({ authorizeStorageUpload: jest.fn(), auditStoredObjectAccess: jest.fn() }))
jest.mock('@/lib/storage/client', () => ({ uploadFile: jest.fn(), removeFiles: jest.fn() }))

const agencyId = '50000000-0000-4000-8000-000000000001'
const actorId = '50000000-0000-4000-8000-000000000002'
const docId = '50000000-0000-4000-8000-000000000003'
const path = `${agencyId}/synthetic.pdf`
const claim = { actorId, agencyId, bucket: 'agency-documents' as const, recordId: agencyId, tableName: 'agencies', path, expiresAt: Date.now() + 60000 }
const input = { agencyId, upload: { path, cleanupToken: 'synthetic-token' }, documentName: 'Synthetic document',
  documentType: 'Other', originalFileName: 'synthetic.pdf', size: 2 * 1024 * 1024 }
let log: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({ user: { id: actorId }, profile: { role: 'admin', agency_id: null } } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(withUserContext).mockImplementation(async (_id, _role, _agency, run) => run())
  jest.mocked(readStorageCleanupToken).mockReturnValue(claim)
  jest.mocked(authorizeStorageUpload).mockResolvedValue({ agencyId, recordId: agencyId, tableName: 'agencies', bucket: 'agency-documents', pathPrefix: `${agencyId}/` })
  jest.mocked(q.insertAgencyDocument).mockResolvedValue({ data: { id: docId }, error: null })
  jest.mocked(q.insertAuditLog).mockResolvedValue({ error: null })
  jest.mocked(uploadFile).mockResolvedValue({ path, error: null })
  jest.mocked(revalidatePath).mockReset()
  log = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => log.mockRestore())

test('accepts a synthetic 2 MB binary file through the upload endpoint, not a Server Action', async () => {
  const file = new File([new Uint8Array(input.size)], 'synthetic.pdf', { type: 'application/pdf' })
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', 'agency-document')
  form.append('resourceId', agencyId)
  const response = await POST(new Request('https://app.example.test/api/storage/upload', { method: 'POST', body: form }))
  expect(response.status).toBe(200)
  expect(authorizeStorageUpload).toHaveBeenCalledWith('agency-document', agencyId)
  expect(uploadFile).toHaveBeenCalledWith('agency-documents', expect.stringMatching(new RegExp(`^${agencyId}/[0-9a-f-]+\\.pdf$`)), expect.objectContaining({ size: input.size }), { contentType: 'application/pdf' })
  expect(JSON.stringify(input).length).toBeLessThan(1024)
})

test('rechecks agency access and saves signed metadata plus non-content audit in the actor transaction', async () => {
  let contextActive = false
  jest.mocked(withUserContext).mockImplementationOnce(async (_id, _role, _agency, run) => {
    contextActive = true
    try { return await run() } finally { contextActive = false }
  })
  jest.mocked(q.insertAgencyDocument).mockImplementationOnce(async () => {
    expect(contextActive).toBe(true)
    return { data: { id: docId }, error: null }
  })
  jest.mocked(q.insertAuditLog).mockImplementationOnce(async () => {
    expect(contextActive).toBe(true)
    return { error: null }
  })
  const result = await commitAgencyDocumentUploadAction(input)
  expect(result).toMatchObject({ success: true, doc: { id: docId, document_name: input.documentName, file_url: path } })
  expect(withUserContext).toHaveBeenCalledWith(actorId, 'admin', null, expect.any(Function))
  expect(authorizeStorageUpload).toHaveBeenCalledWith('agency-document', agencyId)
  expect(q.insertAgencyDocument).toHaveBeenCalledWith(expect.objectContaining({ agency_id: agencyId, uploaded_by: actorId, file_url: path }))
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({ record_id: docId, details: { operation: 'upload' } }))
  expect(uploadFile).not.toHaveBeenCalled()
})

test('returns inline field errors before database access for missing metadata', async () => {
  expect(await commitAgencyDocumentUploadAction({ ...input, documentName: ' ' })).toMatchObject({ success: false, fieldErrors: { documentName: expect.any(Array) } })
  expect(q.insertAgencyDocument).not.toHaveBeenCalled()
})

test('rejects an invalid or expired upload proof before the metadata transaction', async () => {
  jest.mocked(readStorageCleanupToken).mockReturnValueOnce(null)
  expect(await commitAgencyDocumentUploadAction(input)).toMatchObject({ success: false, error: expect.stringContaining('invalid or expired') })
  expect(withUserContext).not.toHaveBeenCalled()
  expect(q.insertAgencyDocument).not.toHaveBeenCalled()
})

test('reports only safe upload-provider diagnostics and a fixed client error', async () => {
  const error = Object.assign(new Error('synthetic-private-path-and-token'), { code: 'AuthorizationPermissionMismatch', statusCode: 403 })
  jest.mocked(uploadFile).mockResolvedValueOnce({ path: null, error })
  const form = new FormData()
  form.append('file', new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' }))
  form.append('purpose', 'agency-document')
  form.append('resourceId', agencyId)
  const response = await POST(new Request('https://app.example.test/api/storage/upload', { method: 'POST', body: form }))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'File upload failed' })
  expect(log.mock.calls).toEqual([['[storage] Upload failed', { stage: 'object-upload', code: 'AuthorizationPermissionMismatch', httpStatus: 403 }]])
})

test.each([
  { actorId: '50000000-0000-4000-8000-000000000099' }, { agencyId: '50000000-0000-4000-8000-000000000099' },
  { recordId: '50000000-0000-4000-8000-000000000099' }, { bucket: 'lead-documents' }, { tableName: 'leads' }, { path: `${agencyId}/other.pdf` },
])('rejects mismatched upload proof without a metadata write: %j', async override => {
  jest.mocked(readStorageCleanupToken).mockReturnValue({ ...claim, ...override } as typeof claim)
  expect(await commitAgencyDocumentUploadAction(input)).toMatchObject({ success: false })
  expect(q.insertAgencyDocument).not.toHaveBeenCalled()
})

test('denies lost sessions or agency access without writing metadata', async () => {
  jest.mocked(getSession).mockResolvedValueOnce(null)
  expect(await commitAgencyDocumentUploadAction(input)).toMatchObject({ success: false, error: expect.stringContaining('session') })
  jest.mocked(authorizeStorageUpload).mockResolvedValueOnce(null)
  expect(await commitAgencyDocumentUploadAction(input)).toMatchObject({ success: false, cleanupRequired: true })
  expect(q.insertAgencyDocument).not.toHaveBeenCalled()
})

test.each(['metadata-save', 'audit'])('classifies a pre-commit %s failure without raw values and allows cleanup', async stage => {
  const error = new Error('synthetic-private-row-and-path')
  if (stage === 'metadata-save') jest.mocked(q.insertAgencyDocument).mockResolvedValueOnce({ data: null, error: error as never })
  else jest.mocked(q.insertAuditLog).mockResolvedValueOnce({ error })
  expect(await commitAgencyDocumentUploadAction(input)).toMatchObject({ success: false, cleanupRequired: true })
  expect(log.mock.calls).toEqual([['[agency-documents] Upload failed', { stage }]])
})

test('does not authorize cleanup after an ambiguous database commit', async () => {
  jest.mocked(withUserContext).mockImplementationOnce(async (_id, _role, _agency, run) => { await run(); throw new Error('synthetic commit interruption') })
  expect(await commitAgencyDocumentUploadAction(input)).toMatchObject({ success: false, cleanupRequired: false, error: expect.stringContaining('uncertain') })
  expect(log.mock.calls).toEqual([['[agency-documents] Upload failed', { stage: 'database-commit' }]])
})

test('a post-commit cache failure does not misreport the saved document as failed', async () => {
  jest.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error('synthetic cache error') })
  expect(await commitAgencyDocumentUploadAction(input)).toMatchObject({ success: true, doc: { id: docId } })
  expect(log.mock.calls).toEqual([['[agency-documents] Upload failed', { stage: 'cache-invalidation' }]])
})
