/** @jest-environment jsdom */

import { getSession } from '@/lib/auth'
import sql, { withUserContext } from '@/db'
import * as q from '@/lib/supabase/query'
import { uploadFile, removeFiles } from '@/lib/storage/client'
import { uploadPatientDocumentsAction } from '@/app/actions/patient-documents'

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
jest.mock('@/lib/storage/client', () => ({ uploadFile: jest.fn(), removeFiles: jest.fn() }))

const patientId = '44000000-0000-4000-8000-000000000001'
const agencyId = '44000000-0000-4000-8000-000000000002'
const legacy = { id: 'legacy', name: 'synthetic-old.pdf', path: `${patientId}/synthetic-old.pdf`, uploaded_at: '2026-01-01T00:00:00Z' }
let storedDocuments: unknown

beforeEach(() => {
  jest.clearAllMocks()
  storedDocuments = JSON.stringify([legacy])
  jest.mocked(getSession).mockResolvedValue({ user: { id: 'synthetic-user' }, profile: { role: 'company_owner', agency_id: agencyId } } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(withUserContext).mockImplementation(async (_userId, _role, _agencyId, fn) => fn())
  ;(sql as unknown as jest.Mock).mockImplementation((strings: TemplateStringsArray) => {
    const statement = Array.from(strings).join(' ')
    if (statement.includes('FOR UPDATE')) return Promise.resolve([{ documents: storedDocuments }])
    return Promise.resolve([{ agency_id: agencyId }])
  })
  jest.mocked(q.updatePatientDocuments).mockImplementation(async (_id, docs) => {
    storedDocuments = docs
    return { data: { documents: storedDocuments }, error: null }
  })
  jest.mocked(q.insertAuditLog).mockResolvedValue({ data: null, error: null } as Awaited<ReturnType<typeof q.insertAuditLog>>)
  jest.mocked(uploadFile).mockResolvedValue({ path: 'synthetic-path', error: null })
  jest.mocked(removeFiles).mockResolvedValue({ error: null })
})

function form(name: string): FormData {
  const data = new FormData()
  data.append('file', new File(['synthetic content'], name, { type: 'application/pdf' }))
  return data
}

test('two separate uploads preserve an encoded legacy document and persist both new documents', async () => {
  const first = await uploadPatientDocumentsAction(patientId, form('synthetic-one.pdf'))
  const second = await uploadPatientDocumentsAction(patientId, form('synthetic-two.pdf'))

  expect(first.error).toBeNull()
  expect(second.error).toBeNull()
  expect(second.data?.map((doc) => doc.name)).toEqual([
    'synthetic-old.pdf', 'synthetic-one.pdf', 'synthetic-two.pdf',
  ])
  expect(storedDocuments).toEqual(second.data)
  expect(q.updatePatientDocuments).toHaveBeenCalledTimes(2)
})

test('malformed stored metadata fails without replacing it and cleans up the new upload', async () => {
  storedDocuments = { unexpected: true }
  const result = await uploadPatientDocumentsAction(patientId, form('synthetic-new.pdf'))

  expect(result.error).toBe('Could not save document metadata')
  expect(q.updatePatientDocuments).not.toHaveBeenCalled()
  expect(removeFiles).toHaveBeenCalledTimes(1)
})
