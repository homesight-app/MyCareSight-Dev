import 'server-only'

import {
  getSensitiveDataKeyProvider,
  getSensitiveFieldCipher,
  type SensitiveFieldContext,
} from '@/lib/security/sensitive-field-cipher'

export type EncryptedSSN = { ciphertext: string; keyId: string }

function keyIdFromEnvelope(ciphertext: string): string {
  try {
    const value = JSON.parse(ciphertext) as { kid?: unknown }
    if (typeof value.kid === 'string') return value.kid
  } catch {
    // The cipher always returns a JSON envelope. Keep the public error generic.
  }
  throw new Error('Unable to encrypt sensitive identifier')
}

export async function encryptSSNWithMetadata(
  ssn: string,
  context: SensitiveFieldContext,
): Promise<EncryptedSSN> {
  const ciphertext = await getSensitiveFieldCipher().encrypt(ssn, context)
  return { ciphertext, keyId: keyIdFromEnvelope(ciphertext) }
}

export async function decryptSSN(
  stored: string,
  context: SensitiveFieldContext,
): Promise<string> {
  if (!stored.trimStart().startsWith('{')) {
    const parts = stored.split(':')
    if (parts.length !== 3 && parts.length !== 4) throw new Error('Invalid encrypted value')
    const [keyId, ivHex, tagHex, ciphertextHex] = parts.length === 4
      ? parts
      : ['legacy', ...parts]
    const { createDecipheriv } = await import('node:crypto')
    const key = await getSensitiveDataKeyProvider().getKey(keyId)
    const decipher = createDecipheriv('aes-256-gcm', key.key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(ciphertextHex, 'hex')).toString('utf8') + decipher.final('utf8')
  }
  return getSensitiveFieldCipher().decrypt(stored, context)
}

export function ssnToLast4(ssn: string): string {
  const digits = ssn.replace(/\D/g, '')
  return digits.slice(-4)
}
