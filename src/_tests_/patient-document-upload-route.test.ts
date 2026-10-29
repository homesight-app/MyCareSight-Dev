/** @jest-environment node */

import { POST } from '@/app/api/storage/upload/route'
import { GET as GET_SIGNED_URL } from '@/app/api/storage/signed-url/route'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'
import { authorizeStorageUpload, authorizeStoredObject, auditStoredObjectAccess } from '@/lib/storage/authorization'
import { uploadFile, getSignedUrl } from '@/lib/storage/client'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/db', () => ({ withUserContext: jest.fn() }))
jest.mock('@/lib/storage/authorization', () => ({
  authorizeStorageUpload: jest.fn(),
  authorizeStoredObject: jest.fn(),
  auditStoredObjectAccess: jest.fn(),
}))
jest.mock('@/lib/storage/client', () => ({ uploadFile: jest.fn(), removeFiles: jest.fn(), getSignedUrl: jest.fn() }))
jest.mock('@/lib/storage/cleanup-token', () => ({ createStorageCleanupToken: jest.fn(() => 'synthetic-token') }))

const patientId = '44000000-0000-4000-8000-000000000001'
const agencyId = '44000000-0000-4000-8000-000000000002'
const actorId = '44000000-0000-4000-8000-000000000003'

test('patient upload authorizes and audits inside the verified actor RLS context', async () => {
  let contextActive = false
  jest.mocked(getSession).mockResolvedValue({
    user: { id: actorId }, profile: { role: 'company_owner', agency_id: agencyId },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(withUserContext).mockImplementation(async (_userId, _role, _agencyId, fn) => {
    contextActive = true
    try { return await fn() } finally { contextActive = false }
  })
  jest.mocked(authorizeStorageUpload).mockImplementation(async () => contextActive ? {
    agencyId, recordId: patientId, tableName: 'patients', bucket: 'patient-documents', pathPrefix: `${patientId}/`,
  } : null)
  jest.mocked(auditStoredObjectAccess).mockImplementation(async () => {
    if (!contextActive) throw new Error('RLS context missing')
  })
  jest.mocked(uploadFile).mockResolvedValue({ path: 'synthetic-path', error: null })

  const form = new FormData()
  form.set('file', new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' }))
  form.set('purpose', 'patient-document')
  form.set('resourceId', patientId)
  const response = await POST(new Request('http://localhost/api/storage/upload', { method: 'POST', body: form }))

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ cleanupToken: 'synthetic-token' })
  expect(withUserContext).toHaveBeenCalledWith(actorId, 'company_owner', agencyId, expect.any(Function))
  expect(authorizeStorageUpload).toHaveBeenCalledWith('patient-document', patientId)
  expect(auditStoredObjectAccess).toHaveBeenCalledWith(actorId, expect.objectContaining({ recordId: patientId }), 'UPLOAD')
})

test('patient document download authorization and audit use the same actor context', async () => {
  let contextActive = false
  jest.mocked(getSession).mockResolvedValue({
    user: { id: actorId }, profile: { role: 'company_owner', agency_id: agencyId },
  } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(withUserContext).mockImplementation(async (_userId, _role, _agencyId, fn) => {
    contextActive = true
    try { return await fn() } finally { contextActive = false }
  })
  jest.mocked(authorizeStoredObject).mockImplementation(async () => contextActive ? {
    agencyId, recordId: patientId, tableName: 'patients',
  } : null)
  jest.mocked(auditStoredObjectAccess).mockImplementation(async () => {
    if (!contextActive) throw new Error('RLS context missing')
  })
  jest.mocked(getSignedUrl).mockResolvedValue('https://example.invalid/synthetic-signed-url')

  const path = `${patientId}/synthetic-object.pdf`
  const response = await GET_SIGNED_URL(new Request(`http://localhost/api/storage/signed-url?bucket=patient-documents&path=${encodeURIComponent(path)}`))
  expect(response.status).toBe(200)
  expect(authorizeStoredObject).toHaveBeenCalledWith('patient-documents', path)
  expect(auditStoredObjectAccess).toHaveBeenCalledWith(actorId, expect.objectContaining({ recordId: patientId }), 'SIGNED_URL')
})
