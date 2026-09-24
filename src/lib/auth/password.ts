import 'server-only'

import argon2 from 'argon2'
import bcrypt from 'bcryptjs'

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (storedHash.startsWith('$argon2')) {
    const valid = await argon2.verify(storedHash, password)
    return {
      valid,
      needsRehash: valid && argon2.needsRehash(storedHash, ARGON2_OPTIONS),
    }
  }

  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    const valid = await bcrypt.compare(password, storedHash)
    return { valid, needsRehash: valid }
  }

  return { valid: false, needsRehash: false }
}
