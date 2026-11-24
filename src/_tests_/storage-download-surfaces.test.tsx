/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DownloadCertificationButton from '@/components/DownloadCertificationButton'
import ApplicationDocumentsPanel from '@/components/ApplicationDocumentsPanel'
import StaffLicenseDetailContent from '@/components/StaffLicenseDetailContent'
import { getApplicationDocumentsByApplicationId } from '@/app/actions/query-bridge'

jest.mock('@/app/actions/query-bridge', () => ({ getApplicationDocumentsByApplicationId: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const originalFetch = global.fetch
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
const fetchMock = jest.fn()
let click: jest.SpyInstance
let alert: jest.SpyInstance
let savedNames: string[]
beforeEach(() => {
  global.fetch = fetchMock
  fetchMock.mockReset()
  URL.createObjectURL = jest.fn(() => 'blob:synthetic-certification')
  URL.revokeObjectURL = jest.fn()
  savedNames = []
  click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    savedNames.push(this.download)
  })
  alert = jest.spyOn(window, 'alert').mockImplementation(() => {})
})
afterEach(() => {
  global.fetch = originalFetch
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  click.mockRestore()
  alert.mockRestore()
})

test('certification button preserves its generated filename, busy state and retry after authentication failure', async () => {
  let complete!: (response: unknown) => void
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  render(<DownloadCertificationButton documentUrl="synthetic/credential.jpg" certificationName="Synthetic License" staffName="Test Person" />)
  fireEvent.click(screen.getByRole('button', { name: 'Download' }))
  expect(screen.getByRole('button', { name: 'Downloading...' })).toBeDisabled()
  await act(async () => complete({ ok: true, blob: async () => new Blob(['synthetic'], { type: 'image/jpeg' }) }))
  expect(savedNames).toEqual(['test_person_synthetic_license.jpg'])
  expect(fetchMock).toHaveBeenCalledWith('/api/storage/download?bucket=application-documents&path=synthetic%2Fcredential.jpg', { cache: 'no-store' })
  expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()

  fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
  fireEvent.click(screen.getByRole('button', { name: 'Download' }))
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Failed to download file. Please try again.'))
  expect(savedNames).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()
})

test('application documents render before metadata and bound concurrent size reads to four', async () => {
  const documents = Array.from({ length: 12 }, (_, i) => ({
    id: `synthetic-${i}`, document_name: `Synthetic document ${i}.pdf`, document_url: `synthetic/${i}.pdf`,
    document_type: 'pdf', status: 'pending', created_at: '2026-01-01T00:00:00.000Z',
  }))
  jest.mocked(getApplicationDocumentsByApplicationId).mockResolvedValue({ data: documents, error: null })
  const pending: ((response: unknown) => void)[] = []
  const metadata = { ok: true, headers: { get: () => '25' } }
  let automaticallyResolve = false
  fetchMock.mockImplementation((_url, options) => {
    if (options?.method !== 'HEAD') return Promise.resolve({ ok: true, blob: async () => new Blob(['synthetic']) })
    if (automaticallyResolve) return Promise.resolve(metadata)
    return new Promise(resolve => pending.push(resolve))
  })
  render(<ApplicationDocumentsPanel applicationId="10000000-0000-4000-8000-000000000001" documentCount={12} />)
  expect(await screen.findByText('Synthetic document 0.pdf')).toBeInTheDocument()
  expect(screen.getAllByTitle('Download')).toHaveLength(12)
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'HEAD')).toHaveLength(4)
  // A metadata request still pending must not block a user-triggered file download.
  fireEvent.click(screen.getAllByTitle('Download')[0])
  await waitFor(() => expect(savedNames).toEqual(['Synthetic document 0.pdf']))
  await act(async () => pending.shift()!(metadata))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'HEAD')).toHaveLength(5))
  automaticallyResolve = true
  await act(async () => { pending.forEach(resolve => resolve(metadata)) })
  expect(await screen.findAllByText(/25 Bytes/)).toHaveLength(12)
  expect(fetchMock.mock.calls.every(([url]) => url.startsWith('/api/storage/download?'))).toBe(true)
})

test('staff license downloads never fetch the stored legacy source URL directly', async () => {
  const reference = 'https://legacy.example.test/storage/v1/object/public/application-documents/synthetic.jpg'
  fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['synthetic'], { type: 'image/jpeg' }) })
  render(<StaffLicenseDetailContent license={{
    id: '10000000-0000-4000-8000-000000000002', license_name: 'Synthetic License', license_type: 'synthetic',
    license_number: null, state: 'CA', status: 'active', activated_date: null, expiry_date: null,
    renewal_due_date: null, issue_date: null, days_until_expiry: null, issuing_authority: null,
    created_at: null, updated_at: null,
  }} documents={[{
    id: '10000000-0000-4000-8000-000000000003', document_name: 'Synthetic Original.jpg',
    document_url: reference, document_type: 'jpg', created_at: null,
  }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Download' }))
  await waitFor(() => expect(savedNames).toEqual(['Synthetic Original.jpg']))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const request = new URL(fetchMock.mock.calls[0][0], 'https://app.example.test')
  expect(request.pathname).toBe('/api/storage/download')
  expect(request.searchParams.get('path')).toBe(reference)
})
