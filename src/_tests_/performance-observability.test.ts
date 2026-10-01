/** @jest-environment node */
import {
  measureDatabaseTransaction,
  measureStorageOperation,
  storageSizeClass,
} from '@/lib/observability/performance'
import { trace } from '@opentelemetry/api'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@opentelemetry/api', () => ({
  SpanKind: { CLIENT: 2 },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  trace: { getTracer: jest.fn() },
}))

const setStatus = jest.fn()
const end = jest.fn()
const startActiveSpan = jest.fn(async (_name, _options, callback) => callback({ setStatus, end }))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=synthetic-test'
  jest.mocked(trace.getTracer).mockReturnValue({ startActiveSpan } as never)
})

afterAll(() => {
  delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
})

test('records only low-cardinality database timing attributes', async () => {
  await expect(measureDatabaseTransaction(async () => 'ok')).resolves.toBe('ok')

  expect(startActiveSpan).toHaveBeenCalledWith(
    'mycaresight.neon.transaction',
    expect.objectContaining({
      kind: 2,
      attributes: {
        'mycaresight.component': 'neon',
        'mycaresight.operation': 'transaction',
      },
    }),
    expect.any(Function)
  )
  expect(setStatus).toHaveBeenCalledWith({ code: 1 })
  expect(end).toHaveBeenCalledTimes(1)
})

test('marks provider failures without recording exception content', async () => {
  const providerError = new Error('sensitive provider detail')
  await expect(measureStorageOperation('upload', 'under_1_mb', async () => {
    throw providerError
  })).rejects.toBe(providerError)

  const serializedCall = JSON.stringify(startActiveSpan.mock.calls)
  expect(serializedCall).not.toContain('sensitive provider detail')
  expect(setStatus).toHaveBeenCalledWith({ code: 2 })
  expect(end).toHaveBeenCalledTimes(1)
})

test('classifies upload sizes without emitting exact byte counts', () => {
  expect(storageSizeClass(null)).toBe('unknown')
  expect(storageSizeClass(0)).toBe('empty')
  expect(storageSizeClass(1024)).toBe('under_1_mb')
  expect(storageSizeClass(1024 * 1024)).toBe('1_to_5_mb')
  expect(storageSizeClass(6 * 1024 * 1024)).toBe('5_to_10_mb')
  expect(storageSizeClass(11 * 1024 * 1024)).toBe('over_10_mb')
})

test('is a no-op wrapper when Application Insights is not configured', async () => {
  delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
  await expect(measureDatabaseTransaction(async () => 42)).resolves.toBe(42)
  expect(trace.getTracer).not.toHaveBeenCalled()
})
