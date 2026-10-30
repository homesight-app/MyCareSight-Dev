#!/usr/bin/env node
import postgres from 'postgres'
import {
  loadManifest,
  readTargetConfiguration,
  validateMigrationControl,
} from './migration-control.mjs'

function printUsage() {
  console.error('Usage: node scripts/database-migrations/cli.mjs <validate|status>')
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
  const sql = postgres(target.databaseUrl, {
    ssl: 'require',
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
  })

  try {
    const [identity] = await sql`
      SELECT current_database() AS database_name, current_user AS database_user
    `
    if (identity.database_name !== target.expectedDatabase) {
      throw new Error('Connected database identity does not match MIGRATION_EXPECTED_DATABASE')
    }

    const [{ ledger_exists: ledgerExists }] = await sql`
      SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ledger_exists
    `
    if (!ledgerExists) {
      console.log(
        `Migration status for ${target.migrationEnvironment}: ledger not installed; bootstrap migration 038 is pending.`
      )
      return
    }

    const applied = await sql`
      SELECT migration_id, file_name, checksum_sha256, release_sha,
             target_environment, applied_at, is_baseline
      FROM public.schema_migrations
      ORDER BY applied_at, migration_id
    `
    const manifest = await loadManifest()
    const byId = new Map(applied.map((row) => [row.migration_id, row]))
    const pending = []
    const drifted = []
    for (const migration of manifest.managedMigrations) {
      if (!migration.environments.includes(target.migrationEnvironment)) continue
      const row = byId.get(migration.id)
      if (!row) pending.push(migration.id)
      else if (row.checksum_sha256 !== migration.checksumSha256) drifted.push(migration.id)
    }

    console.log(`Migration status for ${target.migrationEnvironment}:`)
    console.log(`  applied ledger rows: ${applied.length}`)
    console.log(`  pending managed migrations: ${pending.join(', ') || 'none'}`)
    console.log(`  checksum mismatches: ${drifted.join(', ') || 'none'}`)
    console.log(
      `  legacy baseline recorded: ${byId.has(validation.manifest.legacyBaseline.recordId) ? 'yes' : 'no'}`
    )
    if (drifted.length > 0) process.exitCode = 2
  } finally {
    await sql.end({ timeout: 5 })
  }
}

const command = process.argv[2]
try {
  if (command === 'validate') await validate()
  else if (command === 'status') await status()
  else {
    printUsage()
    process.exitCode = 1
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown migration-control error'
  console.error(`Migration control failed: ${message}`)
  process.exitCode = 1
}
