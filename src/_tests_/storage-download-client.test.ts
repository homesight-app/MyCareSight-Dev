/** @jest-environment node */
import { Readable } from 'node:stream'
import { STORAGE_DOWNLOAD_MAX_BYTES } from '@/lib/storage/contracts'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@azure/identity', () => ({ DefaultAzureCredential: jest.fn() }))
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: jest.fn().mockImplementation(() => ({
    getContainerClient: () => ({ getBlockBlobClient: () => ({ getProperties: properties, download }) }),
  })),
}))
jest.mock('@/lib/observability/performance', () => ({
  measureStorageOperation: (_operation: unknown, _size: unknown, run: () => unknown) => run(),
  storageSizeClass: () => 'synthetic',
}))

const properties = jest.fn()
const download = jest.fn()
let downloadFile: typeof import('@/lib/storage/client').downloadFile
let getFileMetadata: typeof import('@/lib/storage/client').getFileMetadata

beforeAll(async () => { ({ downloadFile, getFileMetadata } = await import('@/lib/storage/client')) })
beforeEach(() => { properties.mockReset(); download.mockReset() })

test('streams a migrated file above 10 MB without buffering it on the server', async () => {
  const size = 24 * 1024 * 1024
  properties.mockResolvedValue({ contentLength: size, contentType: 'application/pdf' })
  download.mockResolvedValue({ readableStreamBody: Readable.from([Buffer.from('synthetic stream')]) })
  const file = await downloadFile('application-documents', 'synthetic.pdf', STORAGE_DOWNLOAD_MAX_BYTES)
  expect(file?.contentLength).toBe(size)
  expect(download).toHaveBeenCalledWith(0, size)
  expect(await new Response(file!.stream).text()).toBe('synthetic stream')
})

test.each([STORAGE_DOWNLOAD_MAX_BYTES + 1, -1, undefined, NaN, 1.5])('rejects unsupported size %s before reading bytes', async size => {
  properties.mockResolvedValue({ contentLength: size })
  expect(await downloadFile('application-documents', 'synthetic.pdf', STORAGE_DOWNLOAD_MAX_BYTES)).toBeNull()
  expect(download).not.toHaveBeenCalled()
})

test('preserves zero-byte migration objects and reads metadata without downloading bytes', async () => {
  properties.mockResolvedValue({ contentLength: 0, contentType: 'application/pdf' })
  expect(await getFileMetadata('application-documents', 'empty.pdf', STORAGE_DOWNLOAD_MAX_BYTES))
    .toEqual({ contentLength: 0, contentType: 'application/pdf' })
  const file = await downloadFile('application-documents', 'empty.pdf', STORAGE_DOWNLOAD_MAX_BYTES)
  expect(await new Response(file!.stream).text()).toBe('')
  expect(file?.contentLength).toBe(0)
  expect(download).not.toHaveBeenCalled()
})

test.each(['blob-properties', 'blob-download'])('classifies %s failures without private provider values', async stage => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const error = { code: 'AuthorizationPermissionMismatch', statusCode: 403, message: 'synthetic-private-url-and-token' }
  properties.mockResolvedValue({ contentLength: 3 })
  if (stage === 'blob-properties') properties.mockRejectedValueOnce(error)
  else download.mockRejectedValueOnce(error)
  try {
    expect(await downloadFile('application-documents', 'synthetic.pdf', STORAGE_DOWNLOAD_MAX_BYTES)).toBeNull()
    expect(log.mock.calls).toEqual([['[storage] Read failed', { stage, code: 'AuthorizationPermissionMismatch', httpStatus: 403 }]])
  } finally { log.mockRestore() }
})
