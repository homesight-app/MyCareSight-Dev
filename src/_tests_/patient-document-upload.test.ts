/** @jest-environment jsdom */

import { getSession } from '@/lib/auth'
import sql, { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import { readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import { commitPatientDocumentUploadAction } from '@/app/actions/patient-documents'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/db', () => ({
  __esModule: true,
  default: jest.fn(),
  withUserContext: jest.fn((_userId, _role, _agencyId, fn) => fn()),
}))
jest.mock('@/lib/supabase/query', () => ({
  updatePatientDocuments: jest.fn(),
  insertAuditLog: jest.fn(),
}))
jest.mock('@/lib/storage/client', () => ({ removeFiles: jest.fn() }))
jest.mock('@/lib/storage/cleanup-token', () => ({ readStorageCleanupToken: jest.fn() }))

const patientId = '44000000-0000-4000-8000-000000000001'
const agencyId = '44000000-0000-4000-8000-000000000002'
const path = `${patientId}/synthetic-object`
const legacy = { id: 'legacy', name: 'synthetic-old.pdf', path: `${patientId}/synthetic-old.pdf`, uploaded_at: '2026-01-01T00:00:00Z' }
let storedDocuments: unknown

const input = () => ({
  patientId,
  upload: { path, cleanupToken: 'synthetic-token' },
  name: 'synthetic-new.pdf',
  size: 668 * 1024,
})

beforeEach(() => {
  jest.clearAllMocks()
  storedDocuments = JSON.stringify([legacy])
  jest.mocked(getSession).mockResolvedValue({ user: { id: 'synthetic-user' }, profile: { role: 'company_owner', agency_id: agencyId } } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(withUserContext).mockImplementation(async (_userId, _role, _agencyId, fn) => fn())
  ;(sql as unknown as jest.Mock).mockResolvedValue([{ agency_id: agencyId, documents: storedDocuments }])
  jest.mocked(q.updatePatientDocuments).mockImplementation(async (_id, docs) => {
    storedDocuments = docs
    return { data: { documents: storedDocuments }, error: null }
  })
  jest.mocked(q.insertAuditLog).mockResolvedValue({ error: null })
  jest.mocked(readStorageCleanupToken).mockReturnValue({
    actorId: 'synthetic-user', bucket: 'patient-documents', tableName: 'patients',
    recordId: patientId, agencyId, path, expiresAt: Date.now() + 1000,
  })
})

test('commits a signed storage upload and preserves existing documents', async () => {
  const result = await commitPatientDocumentUploadAction(input())
  expect(result.error).toBeNull()
  expect(result.data?.map((doc) => doc.name)).toEqual(['synthetic-old.pdf', 'synthetic-new.pdf'])
  expect(q.updatePatientDocuments).toHaveBeenCalledTimes(1)
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    agency_id: agencyId, details: { field: 'documents', added: 1, total: 2 },
  }))
})

test('rejects a path that does not match the signed storage claim', async () => {
  const result = await commitPatientDocumentUploadAction({
    ...input(), upload: { path: `${patientId}/other-object`, cleanupToken: 'synthetic-token' },
  })
  expect(result.error).toBe('Invalid document upload')
  expect(q.updatePatientDocuments).not.toHaveBeenCalled()
})

test('rejects a cross-agency patient even with a valid upload token', async () => {
  ;(sql as unknown as jest.Mock).mockResolvedValue([{ agency_id: 'other-agency', documents: storedDocuments }])
  const result = await commitPatientDocumentUploadAction(input())
  expect(result.error).toBe('Could not save document metadata')
  expect(q.updatePatientDocuments).not.toHaveBeenCalled()
})

test('malformed stored metadata fails without replacing it', async () => {
  storedDocuments = { unexpected: true }
  ;(sql as unknown as jest.Mock).mockResolvedValue([{ agency_id: agencyId, documents: storedDocuments }])
  const result = await commitPatientDocumentUploadAction(input())
  expect(result.error).toBe('Could not save document metadata')
  expect(q.updatePatientDocuments).not.toHaveBeenCalled()
})

test('rejects oversized metadata before reading the patient record', async () => {
  const result = await commitPatientDocumentUploadAction({ ...input(), size: 10 * 1024 * 1024 + 1 })
  expect(result.error).toBe('Invalid document upload')
  expect(sql).not.toHaveBeenCalled()
})
