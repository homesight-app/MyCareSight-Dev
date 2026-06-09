/**
 * Server-only SSN encryption using AES-256-GCM.
 * NEVER import this file in client components.
 *
 * AGENCY_SSN_KEY env var must be a 64-char hex string (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Stored format: iv:authTag:ciphertext (all hex, colon-separated)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.AGENCY_SSN_KEY
  if (!hex) throw new Error('AGENCY_SSN_KEY env var is not set')
  if (hex.length !== 64) throw new Error('AGENCY_SSN_KEY must be a 64-char hex string (32 bytes)')
  return Buffer.from(hex, 'hex')
}

export function encryptSSN(ssn: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(ssn, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSSN(stored: string): string {
  const key = getKey()
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted SSN format')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

export function ssnToLast4(ssn: string): string {
  const digits = ssn.replace(/\D/g, '')
  return digits.slice(-4)
}
