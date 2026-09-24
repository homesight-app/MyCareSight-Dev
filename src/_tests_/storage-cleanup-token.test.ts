/** @jest-environment node */
import {
  createStorageCleanupToken,
  readStorageCleanupToken,
} from '@/lib/storage/cleanup-token'

jest.mock('server-only', () => ({}), { virtual: true })

const claim = {
  actorId: '00000000-0000-4000-8000-000000000001',
  bucket: 'application-documents' as const,
  path: 'synthetic/opaque.pdf',
  agencyId: '00000000-0000-4000-8000-000000000010',
  recordId: '00000000-0000-4000-8000-000000000020',
  tableName: 'applications',
}

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-only-storage-cleanup-secret'
})

test('round-trips an authenticated cleanup claim', () => {
  expect(readStorageCleanupToken(createStorageCleanupToken(claim))).toMatchObject(claim)
})

test('rejects tampered and expired cleanup claims', () => {
  const token = createStorageCleanupToken(claim)
  expect(readStorageCleanupToken(`${token}x`)).toBeNull()
  expect(readStorageCleanupToken(createStorageCleanupToken(claim, -1))).toBeNull()
})
