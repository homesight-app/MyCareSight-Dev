/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@azure/identity', () => ({ DefaultAzureCredential: jest.fn() }))
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: jest.fn().mockImplementation(() => ({ getUserDelegationKey: delegationKey })),
  generateBlobSASQueryParameters: (...args: unknown[]) => generateSas(...args),
  BlobSASPermissions: { parse: jest.fn(() => 'r') },
}))
jest.mock('@/lib/observability/performance', () => ({
  measureStorageOperation: (_operation: string, _size: string, run: () => unknown) => run(),
  storageSizeClass: jest.fn(),
}))
const delegationKey = jest.fn()
const generateSas = jest.fn()
let getSignedUrl: typeof import('@/lib/storage/client').getSignedUrl
let errorLog: jest.SpyInstance
const originalAccount = process.env.AZURE_STORAGE_ACCOUNT_NAME
beforeAll(async () => {
  process.env.AZURE_STORAGE_ACCOUNT_NAME = 'syntheticaccount'
  ;({ getSignedUrl } = await import('@/lib/storage/client'))
})
afterAll(() => {
  if (originalAccount === undefined) delete process.env.AZURE_STORAGE_ACCOUNT_NAME
  else process.env.AZURE_STORAGE_ACCOUNT_NAME = originalAccount
})
beforeEach(() => {
  delegationKey.mockReset().mockResolvedValue({ synthetic: true })
  generateSas.mockReset().mockReturnValue({ toString: () => 'synthetic-test-signature' })
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { errorLog.mockRestore() })

test('normalizes a legacy source reference and signs only the Azure object path', async () => {
  const url = await getSignedUrl('application-documents',
    'https://legacy.example.test/storage/v1/object/public/application-documents/example/synthetic.jpg', 600)
  expect(url).toBe('https://syntheticaccount.blob.core.windows.net/application-documents/example/synthetic.jpg?synthetic-test-signature')
  expect(generateSas).toHaveBeenCalledWith(expect.objectContaining({
    containerName: 'application-documents', blobName: 'example/synthetic.jpg', permissions: 'r',
  }), { synthetic: true }, 'syntheticaccount')
  expect(errorLog).not.toHaveBeenCalled()
})

test.each([
  [{ name: 'AggregateAuthenticationError', message: 'synthetic-secret' }, 'AggregateAuthenticationError', undefined],
  [{ name: 'CredentialUnavailableError' }, 'CredentialUnavailableError', undefined],
  [{ code: 'AuthorizationPermissionMismatch', statusCode: 403 }, 'AuthorizationPermissionMismatch', 403],
  [{ code: 'AuthenticationFailed', statusCode: 403 }, 'AuthenticationFailed', 403],
  [{ cause: { code: 'ENOTFOUND' } }, 'ENOTFOUND', undefined],
  [{ code: 'synthetic-private-path', message: 'synthetic-secret', statusCode: 'synthetic-private-url' }, 'UNCLASSIFIED', undefined],
])('classifies signing failure safely: %j', async (error, code, httpStatus) => {
  delegationKey.mockRejectedValue(error)
  expect(await getSignedUrl('application-documents', 'private/synthetic.jpg')).toBeNull()
  expect(generateSas).not.toHaveBeenCalled()
  expect(errorLog.mock.calls).toEqual([['[storage] Signed URL failed', {
    stage: 'delegation-key', code, ...(httpStatus === undefined ? {} : { httpStatus }),
  }]])
})

test('distinguishes local SAS generation failure without logging key or object details', async () => {
  generateSas.mockImplementation(() => { throw new Error('synthetic-private-key') })
  expect(await getSignedUrl('application-documents', 'private/synthetic.jpg')).toBeNull()
  expect(errorLog.mock.calls).toEqual([['[storage] Signed URL failed', { stage: 'sas-generation', code: 'UNCLASSIFIED' }]])
})
