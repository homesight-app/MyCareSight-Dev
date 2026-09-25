import type { InvocationContext } from '@azure/functions'

type SafeFields = Record<string, string | number | boolean | null | undefined>

export function info(context: InvocationContext, event: string, fields: SafeFields = {}) {
  context.log(JSON.stringify({ event, ...fields }))
}

export function failure(context: InvocationContext, event: string, code: string) {
  context.error(JSON.stringify({ event, errorCode: code }))
}

export function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '')
    if (/^[A-Z0-9_:-]{1,100}$/i.test(code)) return code.toUpperCase()
  }
  return 'UNCLASSIFIED_ERROR'
}
