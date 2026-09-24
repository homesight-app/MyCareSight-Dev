import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { AuthorizedObject } from './authorization'
import type { StorageBucket } from './contracts'

type CleanupClaim = AuthorizedObject & {
  actorId: string
  bucket: StorageBucket
  path: string
  expiresAt: number
}

function secret() {
  const value = process.env.AUTH_SECRET
  if (!value) throw new Error('AUTH_SECRET is required for storage cleanup tokens')
  return value
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createStorageCleanupToken(
  claim: Omit<CleanupClaim, 'expiresAt'>,
  lifetimeSeconds = 15 * 60
) {
  const payload = Buffer.from(JSON.stringify({
    ...claim,
    expiresAt: Date.now() + lifetimeSeconds * 1000,
  })).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function readStorageCleanupToken(token: string): CleanupClaim | null {
  const [payload, suppliedSignature, extra] = token.split('.')
  if (!payload || !suppliedSignature || extra) return null

  const expected = Buffer.from(signature(payload))
  const supplied = Buffer.from(suppliedSignature)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null

  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CleanupClaim
    if (
      !claim.actorId || !claim.bucket || !claim.path || !claim.recordId || !claim.tableName
      || typeof claim.expiresAt !== 'number' || claim.expiresAt < Date.now()
    ) return null
    return claim
  } catch {
    return null
  }
}
