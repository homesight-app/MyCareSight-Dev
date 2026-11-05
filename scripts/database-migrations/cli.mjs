#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import postgres from 'postgres'
import {
  migrationsDirectory,
  readTargetConfiguration,
  validateMigrationControl,
  validateVerifierRows,
} from './migration-control.mjs'

const migrationLockKey = 5065711538674801
const migrationLoginRole = 'mycaresight_migrator'
const migrationExecutionRole = 'mycaresight_schema_owner'

function printUsage() {
  console.error('Usage: node scripts/database-migrations/cli.mjs <validate|status|apply>')
}

function connect(databaseUrl) {
  return postgres(databaseUrl, {
    ssl: 'require',
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
  })
}

async function verifyTargetIdentity(sql, target) {
  const [identity] = await sql`
    SELECT current_database() AS database_name,
           session_user AS session_user,
           current_setting('neon.branch_id', true) AS branch_id
  `
  if (identity.database_name !== target.expectedDatabase) {
    throw new Error('Connected database identity does not match MIGRATION_EXPECTED_DATABASE')
  }
  if (identity.branch_id !== target.expectedBranchId) {
    throw new Error('Connected Neon branch does not match MIGRATION_EXPECTED_BRANCH_ID')
  }
  if (identity.session_user !== migrationLoginRole) {
    throw new Error(`Database migration connection must authenticate as ${migrationLoginRole}`)
  }
}

async function assumeExecutionRole(sql) {
  await sql.unsafe(`SET LOCAL ROLE ${migrationExecutionRole}`)
  const [identity] = await sql`SELECT session_user AS session_user, current_user AS current_user`
  if (
    identity.session_user !== migrationLoginRole ||
    identity.current_user !== migrationExecutionRole
  ) {
    throw new Error('Database migration execution role validation failed')
  }
}

async function ledgerExists(sql) {
  const [result] = await sql`
    SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ledger_exists
  `
  return result.ledger_exists
}

async function readLedger(sql) {
  return sql`
    SELECT migration_id, file_name, checksum_sha256, release_sha,
           target_environment, applied_at, is_baseline
    FROM public.schema_migrations
    ORDER BY applied_at, migration_id
  `
}

function assessState(manifest, applied, migrationEnvironment) {
  const byId = new Map(applied.map((row) => [row.migration_id, row]))
  const applicable = manifest.managedMigrations.filter((migration) =>
    migration.environments.includes(migrationEnvironment)
  )
  const pending = []
  const drifted = []
  for (const migration of applicable) {
    const row = byId.get(migration.id)
    if (!row) pending.push(migration)
    else if (
      row.file_name !== migration.file ||
      row.checksum_sha256 !== migration.checksumSha256
    ) {
      drifted.push(migration.id)
    }
  }
  return { byId, pending, drifted }
}

async function validate() {
  const result = await validateMigrationControl()
  console.log(
    `Migration control valid: ${result.legacyFileCount} legacy files, ${result.managedMigrationCount} managed migration(s).`
  )
}

async function status() {
  const validation = await validateMigrationControl()
  const target = readTargetConfiguration()
  const sql = connect(target.databaseUrl)

  try {
    await verifyTargetIdentity(sql, target)
    const exists = await ledgerExists(sql)
    if (!exists) {
      console.log(
        `Migration status for ${target.migrationEnvironment}: ledger not installed; bootstrap migration 038 is pending.`
      )
      return
    }

    const applied = await sql.begin(async (transaction) => {
      await assumeExecutionRole(transaction)
      return readLedger(transaction)
    })
    const { byId, pending, drifted } = assessState(
      validation.manifest,
      applied,
      target.migrationEnvironment
    )

    console.log(`Migration status for ${target.migrationEnvironment}:`)
    console.log(`  applied ledger rows: ${applied.length}`)
    console.log(`  pending managed migrations: ${pending.map(({ id }) => id).join(', ') || 'none'}`)
    console.log(`  checksum mismatches: ${drifted.join(', ') || 'none'}`)
    console.log(
      `  legacy baseline recorded: ${byId.has(validation.manifest.legacyBaseline.recordId) ? 'yes' : 'no'}`
    )
    if (drifted.length > 0) process.exitCode = 2
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function applyMigration(transaction, migration, target) {
  const migrationSql = await readFile(join(migrationsDirectory, migration.file), 'utf8')
  const verifierSql = await readFile(join(migrationsDirectory, migration.verifier), 'utf8')
  const startedAt = performance.now()

  await transaction.unsafe(migrationSql)
  const verifierResult = await transaction.unsafe(verifierSql)
  validateVerifierRows(
    Array.from(verifierResult),
    migration.verifierExpectations,
    migration.id
  )

  const executionMs = Math.max(0, Math.round(performance.now() - startedAt))
  await transaction`
    INSERT INTO public.schema_migrations (
      migration_id, file_name, checksum_sha256, release_sha,
      target_environment, execution_ms, verifier_file, metadata
    ) VALUES (
      ${migration.id}, ${migration.file}, ${migration.checksumSha256}, ${target.releaseSha},
      ${target.migrationEnvironment}, ${executionMs}, ${migration.verifier},
      ${transaction.json({
        executionMode: 'controlled-runner',
        neonBranchId: target.expectedBranchId,
      })}
    )
  `
}

async function apply() {
  const validation = await validateMigrationControl()
  const target = readTargetConfiguration()
  if (target.releaseSha === null) {
    throw new Error('MIGRATION_RELEASE_SHA is required when applying migrations')
  }
  const sql = connect(target.databaseUrl)
  const appliedIds = []
  let baselineRequired = false

  try {
    await verifyTargetIdentity(sql, target)
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(${migrationLockKey})`
      await assumeExecutionRole(transaction)

      const exists = await ledgerExists(transaction)
      if (!exists) {
        const bootstrap = validation.manifest.managedMigrations.find(({ id }) => id === '038')
        if (!bootstrap?.environments.includes(target.migrationEnvironment)) {
          throw new Error('Ledger bootstrap migration 038 is not approved for this environment')
        }
        await applyMigration(transaction, bootstrap, target)
        appliedIds.push(bootstrap.id)
        baselineRequired = true
        return
      }

      const applied = await readLedger(transaction)
      const { byId, pending, drifted } = assessState(
        validation.manifest,
        applied,
        target.migrationEnvironment
      )
      if (drifted.length > 0) {
        throw new Error(`Applied migration checksum or filename mismatch: ${drifted.join(', ')}`)
      }
      if (!byId.has('038')) {
        throw new Error('Migration ledger exists without its 038 bootstrap record')
      }
      if (pending.length > 0 && !byId.has(validation.manifest.legacyBaseline.recordId)) {
        throw new Error('Legacy baseline must be reviewed and recorded before post-038 migrations')
      }

      for (const migration of pending) {
        await applyMigration(transaction, migration, target)
        appliedIds.push(migration.id)
      }
    })

    if (appliedIds.length === 0) {
      console.log(`Migration apply for ${target.migrationEnvironment}: no pending migrations.`)
    } else {
      console.log(
        `Migration apply for ${target.migrationEnvironment}: applied ${appliedIds.join(', ')} and committed verifier evidence.`
      )
    }
    if (baselineRequired) {
      console.log('Legacy baseline review and recording are required before any later migration can run.')
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

const command = process.argv[2]
try {
  if (command === 'validate') await validate()
  else if (command === 'status') await status()
  else if (command === 'apply') await apply()
  else {
    printUsage()
    process.exitCode = 1
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown migration-control error'
  console.error(`Migration control failed: ${message}`)
  process.exitCode = 1
}
