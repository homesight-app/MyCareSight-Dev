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

beforeAll(async () => { ({ downloadFile } = await import('@/lib/storage/client')) })
beforeEach(() => jest.clearAllMocks())

test('streams a migrated file above 10 MB without buffering it on the server', async () => {
  const size = 24 * 1024 * 1024
  properties.mockResolvedValue({ contentLength: size, contentType: 'application/pdf' })
  download.mockResolvedValue({ readableStreamBody: Readable.from([Buffer.from('synthetic stream')]) })
  const file = await downloadFile('application-documents', 'synthetic.pdf', STORAGE_DOWNLOAD_MAX_BYTES)
  expect(file?.contentLength).toBe(size)
  expect(download).toHaveBeenCalledWith(0, size)
  expect(await new Response(file!.stream).text()).toBe('synthetic stream')
})

test.each([STORAGE_DOWNLOAD_MAX_BYTES + 1, 0, undefined])('rejects unsupported size %s before reading bytes', async size => {
  properties.mockResolvedValue({ contentLength: size })
  expect(await downloadFile('application-documents', 'synthetic.pdf', STORAGE_DOWNLOAD_MAX_BYTES)).toBeNull()
  expect(download).not.toHaveBeenCalled()
})
