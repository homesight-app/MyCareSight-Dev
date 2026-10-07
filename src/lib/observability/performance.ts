import 'server-only'

import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

type StorageOperation = 'upload' | 'download' | 'delete' | 'sign_url'
type StorageSizeClass = 'empty' | 'under_1_mb' | '1_to_5_mb' | '5_to_10_mb' | 'over_10_mb' | 'unknown'

async function measure<T>(
  component: 'neon' | 'azure_blob',
  operation: 'transaction' | StorageOperation,
  sizeClass: StorageSizeClass | null,
  run: () => Promise<T>
): Promise<T> {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return run()

  const tracer = trace.getTracer('mycaresight.performance')
  const attributes: Record<string, string> = {
    'mycaresight.component': component,
    'mycaresight.operation': operation,
  }
  if (sizeClass) attributes['mycaresight.size_class'] = sizeClass

  return tracer.startActiveSpan(
    `mycaresight.${component}.${operation}`,
    { kind: SpanKind.CLIENT, attributes },
    async span => {
      try {
        const result = await run()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        // Do not record the exception: provider errors can include SQL, blob
        // paths, URLs, or request details. Status and duration are sufficient.
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    }
  )
}

export function storageSizeClass(bytes: number | null | undefined): StorageSizeClass {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'unknown'
  if (bytes === 0) return 'empty'
  if (bytes < 1024 * 1024) return 'under_1_mb'
  if (bytes <= 5 * 1024 * 1024) return '1_to_5_mb'
  if (bytes <= 10 * 1024 * 1024) return '5_to_10_mb'
  return 'over_10_mb'
}

export function measureDatabaseTransaction<T>(run: () => Promise<T>): Promise<T> {
  return measure('neon', 'transaction', null, run)
}

export function measureStorageOperation<T>(
  operation: StorageOperation,
  sizeClass: StorageSizeClass,
  run: () => Promise<T>
): Promise<T> {
  return measure('azure_blob', operation, sizeClass, run)
}
