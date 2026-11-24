/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AgencyDocumentsTab from '@/components/AgencyDocumentsTab'
import { commitAgencyDocumentUploadAction } from '@/app/actions/agency-documents'
import { cleanupStoredFile, uploadStoredFile } from '@/lib/storage/browser'
import { getAgencyDocuments } from '@/app/actions/query-bridge'

jest.mock('@/app/actions/agency-documents', () => ({ commitAgencyDocumentUploadAction: jest.fn() }))
jest.mock('@/app/actions/agencies', () => ({ deleteAgencyDocumentAction: jest.fn() }))
jest.mock('@/app/actions/leads', () => ({ deleteLeadDocumentAction: jest.fn() }))
jest.mock('@/app/actions/query-bridge', () => ({ getAgencyDocuments: jest.fn() }))
jest.mock('@/lib/storage/browser', () => ({ uploadStoredFile: jest.fn(), cleanupStoredFile: jest.fn(), downloadStoredFile: jest.fn() }))

const agencyId = '50000000-0000-4000-8000-000000000001'
const upload = { path: `${agencyId}/synthetic.pdf`, cleanupToken: 'synthetic-proof' }
const doc = { id: '50000000-0000-4000-8000-000000000003', document_name: 'Synthetic document',
  file_url: upload.path, file_name: 'synthetic.pdf', document_type: 'Other', created_at: '2026-01-01T00:00:00.000Z' }

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getAgencyDocuments).mockResolvedValue({ data: [], error: null })
  jest.mocked(uploadStoredFile).mockResolvedValue(upload)
  jest.mocked(commitAgencyDocumentUploadAction).mockResolvedValue({ success: true, doc })
})

async function openForm() {
  render(<AgencyDocumentsTab agencyId={agencyId} leadDocuments={[]} leadNameMap={{}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Upload Document' }))
}
function chooseFile(size = 8, type = 'application/pdf') {
  const file = new File([new Uint8Array(size)], 'synthetic.pdf', { type })
  fireEvent.change(screen.getByLabelText(/^File/), { target: { files: [file] } })
  return file
}

test('displays separate required field errors without an upload request', async () => {
  await openForm()
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByText('Document name is required')).toBeInTheDocument()
  expect(screen.getByText('Choose a file')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText(/Document Name/)).toHaveFocus())
  expect(screen.getByLabelText(/^File/)).toHaveAttribute('aria-describedby', 'agency-document-file-error')
  expect(uploadStoredFile).not.toHaveBeenCalled()
})

test('keeps the selected 2 MB file and unchanged name after failure, then succeeds without renaming', async () => {
  jest.mocked(commitAgencyDocumentUploadAction).mockResolvedValueOnce({ success: false, error: 'Could not save this document.', cleanupRequired: true })
  await openForm()
  const file = chooseFile(2 * 1024 * 1024)
  fireEvent.change(screen.getByLabelText(/Document Name/), { target: { value: 'Synthetic document' } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByText('Could not save this document.')).toBeInTheDocument()
  expect(screen.getByLabelText(/Document Name/)).toHaveValue('Synthetic document')
  expect((screen.getByLabelText(/^File/) as HTMLInputElement).files?.[0]).toBe(file)
  expect(cleanupStoredFile).toHaveBeenCalledWith(upload)
  expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByText('Synthetic document')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  expect(uploadStoredFile).toHaveBeenCalledTimes(2)
  expect(uploadStoredFile).toHaveBeenLastCalledWith(file, 'agency-document', agencyId)
  const payloads = jest.mocked(commitAgencyDocumentUploadAction).mock.calls.map(([value]) => value)
  expect(payloads[0]).toEqual(payloads[1])
  expect(payloads[0]).not.toHaveProperty('file')
  expect(payloads[0]).toMatchObject({ agencyId, documentName: 'Synthetic document', upload, size: file.size })
  expect(screen.getByText('Synthetic document')).toBeInTheDocument()
})

test('retains inputs and avoids cleanup or an automatic retry after a lost commit response', async () => {
  jest.mocked(commitAgencyDocumentUploadAction).mockRejectedValueOnce(new Error('synthetic transport interruption'))
  await openForm()
  const file = chooseFile()
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByText(/Upload result is uncertain/)).toBeInTheDocument()
  expect(uploadStoredFile).toHaveBeenCalledTimes(1)
  expect(commitAgencyDocumentUploadAction).toHaveBeenCalledTimes(1)
  expect(cleanupStoredFile).not.toHaveBeenCalled()
  expect((screen.getByLabelText(/^File/) as HTMLInputElement).files?.[0]).toBe(file)
  expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
})

test('shows server field errors beside the correct input without clearing the file', async () => {
  jest.mocked(commitAgencyDocumentUploadAction).mockResolvedValueOnce({ success: false, error: 'Check the highlighted fields.', fieldErrors: { documentName: ['Use a valid document name'] } })
  await openForm()
  const file = chooseFile()
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByText('Use a valid document name')).toBeInTheDocument()
  expect(screen.getByLabelText(/Document Name/)).toHaveAttribute('aria-invalid', 'true')
  expect((screen.getByLabelText(/^File/) as HTMLInputElement).files?.[0]).toBe(file)
})

test.each([
  [0, 'application/pdf', 'Choose a non-empty file'],
  [10 * 1024 * 1024 + 1, 'application/pdf', 'Files must be 10 MB or smaller'],
  [8, 'application/x-synthetic', 'Choose a supported document or image file'],
])('rejects invalid file size/type locally (%s, %s)', async (size, type, message) => {
  await openForm()
  chooseFile(size as number, type as string)
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByText(message as string)).toBeInTheDocument()
  expect(uploadStoredFile).not.toHaveBeenCalled()
})

test('prevents edits or cancellation during a save and releases the busy state afterward', async () => {
  let complete!: (value: Awaited<ReturnType<typeof commitAgencyDocumentUploadAction>>) => void
  jest.mocked(commitAgencyDocumentUploadAction).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  await openForm()
  chooseFile()
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  await waitFor(() => expect(commitAgencyDocumentUploadAction).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText(/Document Name/)).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Upload Document' })).toBeDisabled()
  await act(async () => complete({ success: false, error: 'Synthetic failure', cleanupRequired: true }))
  expect(screen.getByLabelText(/Document Name/)).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
})

test('cancel and reopen clear the hidden file selection and metadata together', async () => {
  await openForm()
  chooseFile()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Upload Document' }))
  expect(screen.getByLabelText(/Document Name/)).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByText('Choose a file')).toBeInTheDocument()
  expect(uploadStoredFile).not.toHaveBeenCalled()
})
