/** @jest-environment node */
import { runDocumentValidation } from '@/app/actions/playbooks'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import { readAuthorizedStoredFile } from '@/lib/storage/server'
import { extractRawText } from 'mammoth'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/db', () => ({ __esModule: true, default: jest.fn(), withUserContext: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({ getRuleChecksForApplicationItem: jest.fn(), getDocumentsByPlaybookItem: jest.fn() }))
jest.mock('@/lib/storage/client', () => ({ removeFiles: jest.fn() }))
jest.mock('@/lib/storage/server', () => ({ readAuthorizedStoredFile: jest.fn() }))
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }))
const mockPdfText = jest.fn()
const mockPdfDestroy = jest.fn()
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn(() => ({ getText: mockPdfText, destroy: mockPdfDestroy })) }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({ user: { id: 'synthetic-user' }, profile: { role: 'admin' } } as Awaited<ReturnType<typeof getSession>>)
  jest.mocked(q.getRuleChecksForApplicationItem).mockResolvedValue({ data: [], error: null })
  jest.mocked(q.getDocumentsByPlaybookItem).mockResolvedValue({ data: [{ document_url: 'synthetic.docx', document_name: 'Synthetic.docx' }], error: null })
  jest.mocked(extractRawText).mockResolvedValue({ value: 'Synthetic document text', messages: [] })
  mockPdfText.mockReset().mockResolvedValue({ text: 'Synthetic PDF text' })
  mockPdfDestroy.mockReset().mockResolvedValue(undefined)
})

test.each([false, true])('PDF parser resources are released after extraction, including failures (%s)', async fail => {
  jest.mocked(q.getDocumentsByPlaybookItem).mockResolvedValueOnce({ data: [{ document_url: 'synthetic.pdf', document_name: 'Synthetic.pdf' }], error: null })
  jest.mocked(readAuthorizedStoredFile).mockResolvedValueOnce({
    stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close() } }), contentLength: 1, contentType: null,
  })
  if (fail) mockPdfText.mockRejectedValueOnce(new Error('synthetic parse failure'))
  expect(await runDocumentValidation('synthetic-item', null)).toMatchObject({ extractionStatus: fail ? 'failed' : 'success' })
  expect(mockPdfDestroy).toHaveBeenCalledTimes(1)
})

test('server validation reads through its authorized boundary instead of a browser-relative HTTP endpoint', async () => {
  jest.mocked(readAuthorizedStoredFile).mockResolvedValueOnce({
    stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close() } }), contentLength: 1, contentType: null,
  })
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('No network allowed'))
  try {
    expect(await runDocumentValidation('synthetic-item', null)).toMatchObject({ error: null, extractionStatus: 'success' })
    expect(readAuthorizedStoredFile).toHaveBeenCalledWith('application-documents', 'synthetic.docx')
    expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})

test('unavailable or unauthorized documents remain a failed extraction without invoking a parser', async () => {
  jest.mocked(readAuthorizedStoredFile).mockResolvedValueOnce(null)
  expect(await runDocumentValidation('synthetic-item', null)).toMatchObject({ extractionStatus: 'failed' })
  expect(extractRawText).not.toHaveBeenCalled()
})
