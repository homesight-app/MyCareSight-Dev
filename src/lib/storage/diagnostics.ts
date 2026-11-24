type SigningStage = 'delegation-key' | 'sas-generation'
const providerCodes = new Set([
  'AuthorizationPermissionMismatch', 'AuthorizationFailure', 'AuthenticationFailed',
  'AccountIsDisabled', 'ResourceNotFound', 'InvalidResourceName',
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED',
])
const credentialNames = new Set([
  'CredentialUnavailableError', 'AggregateAuthenticationError', 'AuthenticationRequiredError',
])

/** Never log raw provider errors: they can contain credentials, URLs and object paths. */
function safeFailureDetails(error: unknown) {
  const candidate = error && typeof error === 'object'
    ? error as { name?: unknown; code?: unknown; statusCode?: unknown; cause?: { code?: unknown }; details?: { errorCode?: unknown } }
    : {}
  const code = [candidate.code, candidate.details?.errorCode, candidate.cause?.code]
    .find(value => typeof value === 'string' && providerCodes.has(value))
  const safeCode = code ?? (typeof candidate.name === 'string' && credentialNames.has(candidate.name)
    ? candidate.name : 'UNCLASSIFIED')
  const status = candidate.statusCode
  return {
    code: safeCode,
    ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? { httpStatus: status } : {}),
  }
}

export function reportSigningFailure(stage: SigningStage, error: unknown): void {
  console.error('[storage] Signed URL failed', { stage, ...safeFailureDetails(error) })
}

export function reportReadFailure(stage: 'blob-properties' | 'blob-download', error: unknown): void {
  console.error('[storage] Read failed', { stage, ...safeFailureDetails(error) })
}

export type AgencyUploadStage = 'authentication' | 'upload-proof' | 'agency-authorization' | 'metadata-save' | 'audit' | 'database-commit' | 'cache-invalidation'
export function reportAgencyUploadFailure(stage: AgencyUploadStage): void {
  // Never include input fields, file names, paths or raw errors.
  console.error('[agency-documents] Upload failed', { stage })
}

export function reportUploadFailure(stage: 'object-upload' | 'upload-audit', error: unknown): void {
  console.error('[storage] Upload failed', { stage, ...safeFailureDetails(error) })
}
