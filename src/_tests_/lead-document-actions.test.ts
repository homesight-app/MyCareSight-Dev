/** @jest-environment jsdom */

import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import { removeFiles } from '@/lib/storage/client'
import { readStorageCleanupToken } from '@/lib/storage/cleanup-token'
import {
  deleteLeadDocument,
  getManageableLead,
  getManageableLeadDocument,
  insertLeadDocument,
} from '@/lib/repositories/lead-documents'
import { commitLeadDocumentUploadAction, deleteLeadDocumentAction } from '@/app/actions/leads'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/db', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { json: jest.fn((value) => value) }),
  withUserContext: jest.fn((_userId, _role, _agencyId, fn) => fn()),
}))
jest.mock('@/lib/supabase/query', () => ({ insertAuditLog: jest.fn() }))
jest.mock('@/lib/storage/client', () => ({ removeFiles: jest.fn() }))
jest.mock('@/lib/storage/cleanup-token', () => ({ readStorageCleanupToken: jest.fn() }))
jest.mock('@/lib/repositories/lead-documents', () => ({
  deleteLeadDocument: jest.fn(),
  getManageableLead: jest.fn(),
  getManageableLeadDocument: jest.fn(),
  insertLeadDocument: jest.fn(),
}))
jest.mock('@/lib/repositories/platform-application-dashboard', () => ({
  readAdminLeadPlatformStaff: jest.fn(),
}))

const leadId = '44000000-0000-4000-8000-000000000001'
const documentId = '44000000-0000-4000-8000-000000000002'
const agencyId = '44000000-0000-4000-8000-000000000003'
const userId = '44000000-0000-4000-8000-000000000004'
const path = `${leadId}/synthetic-object`
const document = {
  id: documentId,
  lead_id: leadId,
  document_name: 'Synthetic proposal',
  file_url: path,
  file_name: 'synthetic.pdf',
  document_type: 'Proposal',
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({
    user: { id: userId },
    profile: { role: 'company_owner', agency_id: agencyId },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(withUserContext).mockImplementation(async (_userId, _role, _agencyId, fn) => fn())
  jest.mocked(readStorageCleanupToken).mockReturnValue({
    actorId: userId,
    bucket: 'lead-documents',
    tableName: 'leads',
    recordId: leadId,
    agencyId,
    path,
    expiresAt: Date.now() + 1000,
  })
  jest.mocked(getManageableLead).mockResolvedValue({ id: leadId, agency_id: agencyId, converted_client_id: null })
  jest.mocked(insertLeadDocument).mockResolvedValue(document)
  jest.mocked(q.insertAuditLog).mockResolvedValue({ error: null })
  jest.mocked(getManageableLeadDocument).mockResolvedValue({
    lead: { id: leadId, agency_id: agencyId, converted_client_id: null },
    document,
  })
  jest.mocked(deleteLeadDocument).mockResolvedValue({ id: documentId })
  jest.mocked(removeFiles).mockResolvedValue({ error: null })
})

test('commits a signed upload for an authorized same-agency manager', async () => {
  const result = await commitLeadDocumentUploadAction({
    leadId,
    upload: { path, cleanupToken: 'synthetic-token' },
    name: 'Synthetic proposal',
    originalFileName: 'synthetic.pdf',
    documentType: 'Proposal',
    size: 1024,
  })
  expect(result).toEqual({ error: null, doc: document })
  expect(insertLeadDocument).toHaveBeenCalledWith(expect.objectContaining({ leadId, path, uploadedBy: userId }))
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    agency_id: agencyId,
    record_id: documentId,
    action: 'CREATE',
  }))
})

test('rejects a mismatched signed object path before writing metadata', async () => {
  const result = await commitLeadDocumentUploadAction({
    leadId,
    upload: { path: `${leadId}/different`, cleanupToken: 'synthetic-token' },
    name: 'Synthetic proposal',
    originalFileName: 'synthetic.pdf',
    documentType: null,
    size: 1024,
  })
  expect(result.error).toBe('Invalid document upload')
  expect(insertLeadDocument).not.toHaveBeenCalled()
})

test('deletes only the server-loaded document path and records evidence', async () => {
  const result = await deleteLeadDocumentAction(leadId, documentId)
  expect(result.error).toBeNull()
  expect(getManageableLeadDocument).toHaveBeenCalledWith(leadId, documentId, userId)
  expect(removeFiles).toHaveBeenCalledWith('lead-documents', [path])
  expect(q.insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    record_id: documentId,
    action: 'DELETE',
  }))
})
