#!/usr/bin/env node
/**
 * Migrate all data from Supabase UAT → Neon UAT branch.
 *
 * Run:
 *   node --env-file=.env.local scripts/migrate-neon-data.mjs
 *   node --env-file=.env.local scripts/migrate-neon-data.mjs --table agencies
 *   node --env-file=.env.local scripts/migrate-neon-data.mjs --dry-run
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEON_UAT_DATABASE_URL  (direct connection, not pooler)
 *
 * Strategy:
 *   - Disables FK constraint checking for the session via session_replication_role
 *   - Paginates Supabase reads in chunks of 1000
 *   - Inserts into Neon in batches of 100 with ON CONFLICT DO NOTHING (idempotent)
 *   - Re-enables FK constraints at the end
 */

import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

// ── CLI flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SINGLE_TABLE = (() => {
  const idx = args.indexOf('--table')
  return idx !== -1 ? args[idx + 1] : null
})()

// ── Env validation ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NEON_URL = process.env.NEON_UAT_DATABASE_URL

const missing = [
  !SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  !NEON_URL && 'NEON_UAT_DATABASE_URL',
].filter(Boolean)

if (missing.length) {
  console.error('Missing required environment variables:')
  missing.forEach(v => console.error(`  ${v}`))
  process.exit(1)
}

// ── Clients ────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const sql = postgres(NEON_URL, {
  ssl: 'require',
  max: 1,      // single connection so session settings persist
  idle_timeout: 120,
  connect_timeout: 30,
})

// ── Table migration order (dependency-safe) ────────────────────────────────
// Wave 1 — no FK dependencies
// Wave 2 — FK to wave 1
// Wave 3 — FK to wave 2
// Wave 4 — FK to wave 3
// Wave 5 — FK to wave 4
// NOTE: session_replication_role='replica' disables FK checks so order is
//       belt-and-suspenders, not strictly required.

const ALL_TABLES = [
  // Wave 1 — no FK dependencies
  'agencies',
  'license_types',
  'user_profiles',
  'configuration_types',
  'validation_rules',
  'task_categories',
  'pricing',
  'plan_features',
  'system_settings',
  'billing_codes',
  'feature_plans',
  'templates',
  'patients',
  'task_catalog',
  // Wave 2 — FK to wave 1
  'configuration_values',     // self-ref parent_id — NULL-parents fetched first
  'agency_admins',
  'care_coordinators',
  'caregiver_members',
  'licensing_experts',
  'user_agency_roles',
  'agency_key_staff',
  'agency_onboarding_tokens',
  'agency_documents',
  'leads',
  'playbooks',
  'license_requirements',
  'licenses',
  'agency_configurations',
  'agency_lead_stages',
  'agency_notes',
  'caregiver_availability_slots',
  'caregiver_credentials',
  'patient_incidents',
  'patients_representatives',
  'patient_service_contracts',
  'patient_care_plan_tasks',
  'visit_series',
  'task_required_credentials',
  // Wave 3 — FK to wave 2
  'playbook_items',
  'playbook_templates',
  'license_requirement_templates',
  'applications',
  'lead_documents',
  'license_documents',
  'cases',
  'lead_notes',
  'lead_tasks',
  'license_requirement_documents',
  'license_requirement_steps',
  'scheduled_visits',
  // Wave 4 — FK to wave 3
  'playbook_item_validation_rules',
  'application_steps',
  'application_documents',
  'conversations',
  'certification_applications',
  'patient_addresses',
  'patient_lead_details',
  'patient_skill_requirements',
  'schedule_assignment_requests',
  'schedule_unassignment_requests',
  'validation_runs',
  'application_playbook_items',
  'scheduled_visit_tasks',
  // Wave 5 — FK to wave 4
  'application_playbook_item_rule_checks',
  'messages',
  'notifications',
  'audit_log',
]

const TABLES = SINGLE_TABLE
  ? ALL_TABLES.filter(t => t === SINGLE_TABLE)
  : ALL_TABLES

if (SINGLE_TABLE && TABLES.length === 0) {
  console.error(`Unknown table: ${SINGLE_TABLE}`)
  console.error(`Valid tables: ${ALL_TABLES.join(', ')}`)
  process.exit(1)
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchAllRows(tableName) {
  const PAGE_SIZE = 1000
  const rows = []
  let from = 0

  // Special case: configuration_values — fetch NULL-parent rows first so
  // the self-referential FK is satisfied even when FK checks are disabled
  const isConfigValues = tableName === 'configuration_values'

  while (true) {
    let query = supabase.from(tableName).select('*').range(from, from + PAGE_SIZE - 1)

    if (isConfigValues) {
      // Sort nulls-first so parent rows come before children
      query = query.order('parent_id', { ascending: true, nullsFirst: true })
    }

    const { data, error } = await query

    if (error) throw new Error(`Supabase read error [${tableName}]: ${error.message}`)
    if (!data || data.length === 0) break

    rows.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function insertRows(tableName, rows) {
  if (rows.length === 0) return 0

  const BATCH_SIZE = 100
  let inserted = 0

  const cols = Object.keys(rows[0])

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    try {
      await sql`INSERT INTO ${sql(tableName)} ${sql(batch, ...cols)} ON CONFLICT DO NOTHING`
      inserted += batch.length
    } catch (err) {
      console.error(`\n  [insert error] ${tableName} rows ${i}-${i + BATCH_SIZE - 1}: ${err.message}`)
    }
  }

  return inserted
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Supabase UAT → Neon UAT Data Migration ===')
  if (DRY_RUN) console.log('*** DRY RUN — no data will be written ***')
  console.log(`Source : ${SUPABASE_URL}`)
  console.log(`Dest   : Neon UAT (br-empty-mouse-axnk8fbc)`)
  console.log(`Tables : ${TABLES.length}`)
  console.log('')

  if (!DRY_RUN) {
    // Disable FK constraint checking for this session
    try {
      await sql`SET session_replication_role = 'replica'`
      console.log('FK constraints disabled for session\n')
    } catch (err) {
      console.warn(`Warning: could not disable FK constraints: ${err.message}`)
      console.warn('Proceeding with dependency-ordered inserts\n')
    }
  }

  let totalRows = 0
  const results = []

  for (const table of TABLES) {
    try {
      process.stdout.write(`  ${table.padEnd(45)}`)

      const rows = await fetchAllRows(table)

      if (DRY_RUN) {
        console.log(`${rows.length} rows (dry run)`)
        results.push({ table, rows: rows.length, status: 'dry' })
        continue
      }

      const inserted = await insertRows(table, rows)
      console.log(`${String(inserted).padStart(5)} rows`)
      totalRows += inserted
      results.push({ table, rows: inserted, status: 'ok' })
    } catch (err) {
      console.log(`ERROR`)
      console.error(`  └─ ${err.message}`)
      results.push({ table, rows: 0, status: 'error', error: err.message })
    }
  }

  if (!DRY_RUN) {
    // Re-enable FK constraints
    try {
      await sql`SET session_replication_role = 'origin'`
      console.log('\nFK constraints re-enabled')
    } catch (_) { /* ignore */ }
  }

  // Summary
  console.log('\n=== Summary ===')
  for (const r of results) {
    const status = r.status === 'error' ? `ERROR: ${r.error}` : `${r.rows} rows`
    console.log(`  ${r.table.padEnd(45)} ${status}`)
  }

  const errors = results.filter(r => r.status === 'error')
  console.log(`\nTotal rows migrated: ${totalRows}`)

  if (errors.length > 0) {
    console.error(`\n⚠  ${errors.length} table(s) had errors. Fix and re-run — already-inserted rows will be skipped.`)
    await sql.end()
    process.exit(1)
  } else {
    console.log('✓ All tables migrated successfully.')
  }

  await sql.end()
}

main().catch(err => {
  console.error('\nFatal:', err.message ?? err)
  sql.end().catch(() => {})
  process.exit(1)
})
