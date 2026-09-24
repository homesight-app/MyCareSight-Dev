import bcrypt from 'bcryptjs'

jest.mock('server-only', () => ({}))

import { hashPassword, verifyPassword } from '@/lib/auth/password'

describe('auth password hashing', () => {
  it('writes and verifies Argon2id hashes', async () => {
    const hash = await hashPassword('correct horse battery staple')

    expect(hash).toMatch(/^\$argon2id\$/)
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toEqual({
      valid: true,
      needsRehash: false,
    })
    await expect(verifyPassword('incorrect', hash)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    })
  })

  it('accepts a legacy bcrypt hash and marks it for upgrade', async () => {
    const hash = await bcrypt.hash('legacy password', 4)

    await expect(verifyPassword('legacy password', hash)).resolves.toEqual({
      valid: true,
      needsRehash: true,
    })
  })

  it('rejects unknown hash formats', async () => {
    await expect(verifyPassword('password', 'plaintext')).resolves.toEqual({
      valid: false,
      needsRehash: false,
    })
  })
})
