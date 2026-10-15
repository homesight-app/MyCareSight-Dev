import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { DefaultAzureCredential } from '@azure/identity'

const ALGORITHM = 'aes-256-gcm'
const ENVELOPE_ALGORITHM = 'A256GCM'
const ENVELOPE_VERSION = 1
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16
const KEY_VAULT_SCOPE = 'https://vault.azure.net/.default'
const KEY_VAULT_API_VERSION = '7.4'

export type SensitiveFieldContext = {
  agencyId: string
  recordId: string
  field: string
}

export type SensitiveDataKey = {
  id: string
  key: Buffer
}

export interface SensitiveDataKeyProvider {
  getActiveKey(): Promise<SensitiveDataKey>
  getKey(keyId: string): Promise<SensitiveDataKey>
}

export interface SensitiveFieldCipher {
  encrypt(plaintext: string, context: SensitiveFieldContext): Promise<string>
  decrypt(serializedEnvelope: string, context: SensitiveFieldContext): Promise<string>
}

type EncryptionEnvelope = {
  v: 1
  alg: 'A256GCM'
  kid: string
  iv: string
  tag: string
  ct: string
}

type TokenCredentialLike = {
  getToken(scope: string): Promise<{ token: string } | null>
}

function parseKey(value: string | undefined, source: string): Buffer {
  if (!value) throw new Error(`${source} is not configured`)
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${source} must contain a 32-byte hexadecimal key`)
  }
  return Buffer.from(value, 'hex')
}

function validateKeyId(keyId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(keyId)) throw new Error('Invalid sensitive-data key identifier')
  return keyId
}

function deploymentEnvironment(): string {
  const value = process.env.SENSITIVE_DATA_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development'
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(value)) throw new Error('Invalid sensitive-data environment')
  return value
}

function authenticatedContext(environment: string, context: SensitiveFieldContext): Buffer {
  if (!context.agencyId || !context.recordId || !/^[a-z][a-z0-9_]{1,63}$/.test(context.field)) {
    throw new Error('Invalid sensitive-field encryption context')
  }
  return Buffer.from(JSON.stringify({
    v: ENVELOPE_VERSION,
    env: environment,
    agency: context.agencyId,
    record: context.recordId,
    field: context.field,
  }), 'utf8')
}

function parseEnvelope(serialized: string): EncryptionEnvelope {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Invalid encrypted value')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid encrypted value')
  const envelope = value as Partial<EncryptionEnvelope>
  if (
    envelope.v !== ENVELOPE_VERSION
    || envelope.alg !== ENVELOPE_ALGORITHM
    || typeof envelope.kid !== 'string'
    || typeof envelope.iv !== 'string'
    || typeof envelope.tag !== 'string'
    || typeof envelope.ct !== 'string'
  ) {
    throw new Error('Unsupported encrypted value')
  }
  validateKeyId(envelope.kid)
  const iv = Buffer.from(envelope.iv, 'base64url')
  const tag = Buffer.from(envelope.tag, 'base64url')
  if (iv.byteLength !== NONCE_BYTES || tag.byteLength !== TAG_BYTES || envelope.ct.length === 0) {
    throw new Error('Invalid encrypted value')
  }
  return envelope as EncryptionEnvelope
}

export function createSensitiveFieldCipher(
  keyProvider: SensitiveDataKeyProvider,
  environment = deploymentEnvironment()
): SensitiveFieldCipher {
  return {
    async encrypt(plaintext, context) {
      const active = await keyProvider.getActiveKey()
      if (active.key.byteLength !== KEY_BYTES) throw new Error('Invalid sensitive-data key length')
      const iv = randomBytes(NONCE_BYTES)
      const cipher = createCipheriv(ALGORITHM, active.key, iv)
      cipher.setAAD(authenticatedContext(environment, context))
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const envelope: EncryptionEnvelope = {
        v: ENVELOPE_VERSION,
        alg: ENVELOPE_ALGORITHM,
        kid: validateKeyId(active.id),
        iv: iv.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
        ct: ciphertext.toString('base64url'),
      }
      return JSON.stringify(envelope)
    },

    async decrypt(serializedEnvelope, context) {
      const envelope = parseEnvelope(serializedEnvelope)
      const key = await keyProvider.getKey(envelope.kid)
      if (key.key.byteLength !== KEY_BYTES) throw new Error('Invalid sensitive-data key length')
      const decipher = createDecipheriv(ALGORITHM, key.key, Buffer.from(envelope.iv, 'base64url'))
      decipher.setAAD(authenticatedContext(environment, context))
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ct, 'base64url')),
        decipher.final(),
      ])
      return plaintext.toString('utf8')
    },
  }
}

export class EnvironmentSensitiveDataKeyProvider implements SensitiveDataKeyProvider {
  private configured(): { activeId: string; keys: Record<string, Buffer> } {
    const serialized = process.env.SENSITIVE_DATA_KEYS ?? process.env.SSN_ENCRYPTION_KEYS
    if (serialized) {
      let parsed: unknown
      try {
        parsed = JSON.parse(serialized)
      } catch {
        throw new Error('Sensitive-data key configuration is invalid')
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Sensitive-data key configuration is invalid')
      }
      const keys = Object.fromEntries(Object.entries(parsed).map(([id, value]) => [
        validateKeyId(id),
        parseKey(typeof value === 'string' ? value : undefined, `sensitive-data key ${id}`),
      ]))
      const activeId = process.env.SENSITIVE_DATA_ACTIVE_KEY_ID
        ?? process.env.SSN_ACTIVE_KEY_VERSION
        ?? ''
      if (!keys[activeId]) throw new Error('The active sensitive-data key is not configured')
      return { activeId, keys }
    }

    return {
      activeId: 'legacy',
      keys: { legacy: parseKey(process.env.AGENCY_SSN_KEY, 'AGENCY_SSN_KEY') },
    }
  }

  async getActiveKey(): Promise<SensitiveDataKey> {
    const { activeId, keys } = this.configured()
    return { id: activeId, key: keys[activeId] }
  }

  async getKey(keyId: string): Promise<SensitiveDataKey> {
    const { keys } = this.configured()
    const key = keys[validateKeyId(keyId)]
    if (!key) throw new Error('Sensitive-data key version is unavailable')
    return { id: keyId, key }
  }
}

export class AzureKeyVaultSensitiveDataKeyProvider implements SensitiveDataKeyProvider {
  private readonly cache = new Map<string, SensitiveDataKey>()
  private activeCacheExpiresAt = 0

  constructor(
    private readonly vaultUrl: string,
    private readonly secretName: string,
    private readonly credential: TokenCredentialLike = new DefaultAzureCredential(),
    private readonly legacySecretName?: string,
  ) {
    if (!/^https:\/\/[a-zA-Z0-9-]+\.vault\.azure\.net\/?$/.test(vaultUrl)) {
      throw new Error('AZURE_KEY_VAULT_URL is invalid')
    }
    if (!/^[a-zA-Z0-9-]{1,127}$/.test(secretName)) {
      throw new Error('SENSITIVE_DATA_KEY_SECRET_NAME is invalid')
    }
    if (legacySecretName && !/^[a-zA-Z0-9-]{1,127}$/.test(legacySecretName)) {
      throw new Error('SENSITIVE_DATA_LEGACY_KEY_SECRET_NAME is invalid')
    }
  }

  private async load(version?: string): Promise<SensitiveDataKey> {
    const cacheKey = version ?? '__active__'
    const cached = this.cache.get(cacheKey)
    if (cached && (version || Date.now() < this.activeCacheExpiresAt)) return cached

    try {
      const accessToken = await this.credential.getToken(KEY_VAULT_SCOPE)
      if (!accessToken) throw new Error('token unavailable')
      const useLegacySecret = version === 'legacy' && Boolean(this.legacySecretName)
      const requestedSecretName = useLegacySecret ? this.legacySecretName! : this.secretName
      const suffix = version && !useLegacySecret ? `/${encodeURIComponent(validateKeyId(version))}` : ''
      const endpoint = `${this.vaultUrl.replace(/\/$/, '')}/secrets/${encodeURIComponent(requestedSecretName)}${suffix}?api-version=${KEY_VAULT_API_VERSION}`
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken.token}` },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('secret unavailable')
      const body = await response.json() as { id?: string; value?: string }
      const resolvedVersion = body.id?.split('/').filter(Boolean).at(-1)
      if (!resolvedVersion) throw new Error('secret version unavailable')
      const key = {
        id: useLegacySecret ? 'legacy' : validateKeyId(resolvedVersion),
        key: parseKey(body.value, 'Azure Key Vault sensitive-data key'),
      }
      this.cache.set(key.id, key)
      if (!version) {
        this.cache.set('__active__', key)
        this.activeCacheExpiresAt = Date.now() + 5 * 60 * 1000
      }
      return key
    } catch {
      throw new Error('Sensitive-data key service is unavailable')
    }
  }

  getActiveKey(): Promise<SensitiveDataKey> {
    return this.load()
  }

  getKey(keyId: string): Promise<SensitiveDataKey> {
    return this.load(keyId)
  }
}

let cipherSingleton: SensitiveFieldCipher | null = null
let providerSingleton: SensitiveDataKeyProvider | null = null

export function getSensitiveDataKeyProvider(): SensitiveDataKeyProvider {
  if (providerSingleton) return providerSingleton
  const mode = process.env.SENSITIVE_DATA_KEY_PROVIDER
    ?? (process.env.AZURE_KEY_VAULT_URL ? 'azure-key-vault' : 'environment')
  const provider = mode === 'azure-key-vault'
    ? new AzureKeyVaultSensitiveDataKeyProvider(
        process.env.AZURE_KEY_VAULT_URL ?? '',
        process.env.SENSITIVE_DATA_KEY_SECRET_NAME ?? '',
        new DefaultAzureCredential(),
        process.env.SENSITIVE_DATA_LEGACY_KEY_SECRET_NAME,
      )
    : mode === 'environment'
      ? new EnvironmentSensitiveDataKeyProvider()
      : null
  if (!provider) throw new Error('Unsupported sensitive-data key provider')
  providerSingleton = provider
  return providerSingleton
}

export function getSensitiveFieldCipher(): SensitiveFieldCipher {
  if (cipherSingleton) return cipherSingleton
  cipherSingleton = createSensitiveFieldCipher(getSensitiveDataKeyProvider())
  return cipherSingleton
}

export function resetSensitiveFieldCipherForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Cipher reset is test-only')
  cipherSingleton = null
  providerSingleton = null
}
