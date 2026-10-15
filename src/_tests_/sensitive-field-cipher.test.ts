/** @jest-environment node */

jest.mock('server-only', () => ({}), { virtual: true })

import {
  AzureKeyVaultSensitiveDataKeyProvider,
  createSensitiveFieldCipher,
  type SensitiveDataKey,
  type SensitiveDataKeyProvider,
} from '@/lib/security/sensitive-field-cipher'

const context = {
  agencyId: '10000000-0000-4000-8000-000000000001',
  recordId: '10000000-0000-4000-8000-000000000002',
  field: 'personnel_ssn',
}

class RotatingProvider implements SensitiveDataKeyProvider {
  activeId = 'key_1'
  readonly keys = new Map<string, Buffer>([
    ['key_1', Buffer.alloc(32, 1)],
    ['key_2', Buffer.alloc(32, 2)],
  ])

  async getActiveKey(): Promise<SensitiveDataKey> {
    return this.getKey(this.activeId)
  }

  async getKey(keyId: string): Promise<SensitiveDataKey> {
    const key = this.keys.get(keyId)
    if (!key) throw new Error('missing key')
    return { id: keyId, key }
  }
}

describe('sensitive field cipher', () => {
  test('uses a unique nonce and decrypts an authenticated envelope', async () => {
    const cipher = createSensitiveFieldCipher(new RotatingProvider(), 'uat')
    const first = await cipher.encrypt('123456789', context)
    const second = await cipher.encrypt('123456789', context)

    expect(first).not.toEqual(second)
    expect(JSON.parse(first)).toEqual(expect.objectContaining({
      v: 1,
      alg: 'A256GCM',
      kid: 'key_1',
      iv: expect.any(String),
      tag: expect.any(String),
      ct: expect.any(String),
    }))
    await expect(cipher.decrypt(first, context)).resolves.toBe('123456789')
  })

  test('rejects tampering and ciphertext moved to another record', async () => {
    const cipher = createSensitiveFieldCipher(new RotatingProvider(), 'uat')
    const encrypted = await cipher.encrypt('123456789', context)
    const envelope = JSON.parse(encrypted) as { tag: string }
    envelope.tag = `${envelope.tag[0] === 'A' ? 'B' : 'A'}${envelope.tag.slice(1)}`

    await expect(cipher.decrypt(JSON.stringify(envelope), context)).rejects.toThrow()
    await expect(cipher.decrypt(encrypted, { ...context, recordId: '10000000-0000-4000-8000-000000000003' })).rejects.toThrow()
  })

  test('decrypts records written with previous key versions after rotation', async () => {
    const provider = new RotatingProvider()
    const cipher = createSensitiveFieldCipher(provider, 'uat')
    const first = await cipher.encrypt('123456789', context)
    provider.activeId = 'key_2'
    const second = await cipher.encrypt('987654321', context)

    expect(JSON.parse(first).kid).toBe('key_1')
    expect(JSON.parse(second).kid).toBe('key_2')
    await expect(cipher.decrypt(first, context)).resolves.toBe('123456789')
    await expect(cipher.decrypt(second, context)).resolves.toBe('987654321')
  })

  test('binds ciphertext to its deployment environment', async () => {
    const provider = new RotatingProvider()
    const uat = createSensitiveFieldCipher(provider, 'uat')
    const production = createSensitiveFieldCipher(provider, 'production')
    const encrypted = await uat.encrypt('123456789', context)

    await expect(production.decrypt(encrypted, context)).rejects.toThrow()
  })

  test('loads active and historical Azure Key Vault secret versions with a managed credential', async () => {
    const credential = { getToken: jest.fn().mockResolvedValue({ token: 'managed-token' }) }
    const request = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'https://uat-vault.vault.azure.net/secrets/personnel-key/version-2',
        value: Buffer.alloc(32, 2).toString('hex'),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'https://uat-vault.vault.azure.net/secrets/personnel-key/version-1',
        value: Buffer.alloc(32, 1).toString('hex'),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'https://uat-vault.vault.azure.net/secrets/personnel-key-legacy/original',
        value: Buffer.alloc(32, 3).toString('hex'),
      }), { status: 200 }))
    const provider = new AzureKeyVaultSensitiveDataKeyProvider(
      'https://uat-vault.vault.azure.net',
      'personnel-key',
      credential,
      'personnel-key-legacy',
    )

    await expect(provider.getActiveKey()).resolves.toEqual({
      id: 'version-2',
      key: Buffer.alloc(32, 2),
    })
    await expect(provider.getKey('version-1')).resolves.toEqual({
      id: 'version-1',
      key: Buffer.alloc(32, 1),
    })
    await expect(provider.getKey('legacy')).resolves.toEqual({
      id: 'legacy',
      key: Buffer.alloc(32, 3),
    })
    expect(credential.getToken).toHaveBeenCalledWith('https://vault.azure.net/.default')
    expect(request.mock.calls[0][0]).toBe(
      'https://uat-vault.vault.azure.net/secrets/personnel-key?api-version=7.4',
    )
    expect(request.mock.calls[1][0]).toBe(
      'https://uat-vault.vault.azure.net/secrets/personnel-key/version-1?api-version=7.4',
    )
    expect(request.mock.calls[2][0]).toBe(
      'https://uat-vault.vault.azure.net/secrets/personnel-key-legacy?api-version=7.4',
    )
    request.mockRestore()
  })
})
