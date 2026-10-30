import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = resolve(moduleDirectory, '..', '..')
export const migrationsDirectory = join(repositoryRoot, 'scripts', 'migrations')
export const manifestPath = join(moduleDirectory, 'manifest.json')

const migrationFilePattern = /^(\d{3}[a-z]?)-([a-z0-9][a-z0-9-]*)\.sql$/
const verifierFilePattern = /^\d{3}[a-z]?-verify-[a-z0-9][a-z0-9-]*\.sql$/
const allowedEnvironments = new Set([
  'development',
  'uat',
  'production-staging',
  'production',
  'environment-base',
])

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'))
}

export async function calculateLegacyInventory(manifest) {
  const excluded = new Set(manifest.legacyBaseline.excludedFiles)
  const managed = new Set(manifest.managedMigrations.map((migration) => migration.file))
  const files = (await readdir(migrationsDirectory))
    .filter((file) => migrationFilePattern.test(file))
    .filter((file) => !verifierFilePattern.test(file))
    .filter((file) => !excluded.has(file) && !managed.has(file))
    .sort((left, right) => left.localeCompare(right))

  const inventory = []
  for (const file of files) {
    const contents = await readFile(join(migrationsDirectory, file))
    inventory.push({ file, checksumSha256: sha256(contents) })
  }
  const digestInput = inventory
    .map(({ file, checksumSha256 }) => `${file}\0${checksumSha256}\n`)
    .join('')
  return { inventory, checksumSha256: sha256(digestInput) }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }
}

export async function validateMigrationControl() {
  const manifest = await loadManifest()
  if (manifest.manifestVersion !== 1) throw new Error('Unsupported migration manifest version')
  requireString(manifest.legacyBaseline?.recordId, 'legacyBaseline.recordId')
  requireString(manifest.legacyBaseline?.inventoryChecksumSha256, 'legacy baseline checksum')
  if (!/^[0-9a-f]{64}$/.test(manifest.legacyBaseline.inventoryChecksumSha256)) {
    throw new Error('Legacy baseline checksum must be a lowercase SHA-256 value')
  }

  const { inventory, checksumSha256 } = await calculateLegacyInventory(manifest)
  if (checksumSha256 !== manifest.legacyBaseline.inventoryChecksumSha256) {
    throw new Error('Legacy migration inventory checksum mismatch; historical SQL is immutable')
  }

  const ids = new Set()
  const files = new Set()
  for (const migration of manifest.managedMigrations) {
    requireString(migration.id, 'migration.id')
    requireString(migration.file, `migration ${migration.id} file`)
    requireString(migration.verifier, `migration ${migration.id} verifier`)
    if (ids.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`)
    if (files.has(migration.file)) throw new Error(`Duplicate migration file: ${migration.file}`)
    ids.add(migration.id)
    files.add(migration.file)

    const match = migration.file.match(migrationFilePattern)
    if (!match || match[1] !== migration.id) {
      throw new Error(`Migration ${migration.id} filename does not match its id`)
    }
    if (!migration.transactional) {
      throw new Error(`Migration ${migration.id} requires an explicitly reviewed non-transactional runner`)
    }
    if (!Array.isArray(migration.environments) || migration.environments.length === 0) {
      throw new Error(`Migration ${migration.id} must declare target environments`)
    }
    for (const environment of migration.environments) {
      if (!allowedEnvironments.has(environment)) {
        throw new Error(`Migration ${migration.id} has unsupported environment ${environment}`)
      }
    }

    const migrationContents = await readFile(join(migrationsDirectory, migration.file))
    const verifierContents = await readFile(join(migrationsDirectory, migration.verifier))
    const actualChecksum = sha256(migrationContents)
    if (actualChecksum !== migration.checksumSha256) {
      throw new Error(`Migration ${migration.id} checksum mismatch`)
    }
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(migrationContents.toString('utf8'))) {
      throw new Error(`Managed migration ${migration.id} contains transaction control`)
    }
    if (verifierContents.length === 0) throw new Error(`Migration ${migration.id} verifier is empty`)
  }

  return {
    manifest,
    legacyFileCount: inventory.length,
    managedMigrationCount: manifest.managedMigrations.length,
  }
}

export function readTargetConfiguration(environment = process.env) {
  const migrationEnvironment = environment.MIGRATION_ENVIRONMENT
  const databaseUrl = environment.DATABASE_MIGRATION_URL
  const expectedHost = environment.MIGRATION_EXPECTED_HOST
  const expectedDatabase = environment.MIGRATION_EXPECTED_DATABASE

  if (!allowedEnvironments.has(migrationEnvironment)) {
    throw new Error('MIGRATION_ENVIRONMENT is missing or unsupported')
  }
  requireString(databaseUrl, 'DATABASE_MIGRATION_URL')
  requireString(expectedHost, 'MIGRATION_EXPECTED_HOST')
  requireString(expectedDatabase, 'MIGRATION_EXPECTED_DATABASE')

  const parsedUrl = new URL(databaseUrl)
  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new Error('DATABASE_MIGRATION_URL must use the PostgreSQL protocol')
  }
  if (parsedUrl.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new Error('Migration connection host does not match MIGRATION_EXPECTED_HOST')
  }
  if (decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')) !== expectedDatabase) {
    throw new Error('Migration connection database does not match MIGRATION_EXPECTED_DATABASE')
  }

  return {
    migrationEnvironment,
    databaseUrl,
    expectedHost,
    expectedDatabase,
  }
}
