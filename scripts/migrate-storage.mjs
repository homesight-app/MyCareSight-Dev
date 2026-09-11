#!/usr/bin/env node
/**
 * Migrate files from Supabase Storage → Azure Blob Storage.
 *
 * Run:
 *   node --env-file=.env.local scripts/migrate-storage.mjs
 *   node --env-file=.env.local scripts/migrate-storage.mjs --dry-run
 *   node --env-file=.env.local scripts/migrate-storage.mjs --bucket agency-public
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL      - e.g. https://ruidwstxnkgajavxsyft.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     - service role key (never exposed to browser)
 *   AZURE_STORAGE_ACCOUNT_NAME    - e.g. stmycaresightuat
 *
 * Azure auth: DefaultAzureCredential
 *   Locally  → az login (Azure CLI)
 *   App Svc  → Managed Identity (no extra config needed)
 *
 * Idempotent: files already present in Azure are skipped, not overwritten.
 * Re-run safely after partial failures — only missing files are copied.
 */

import { createClient } from '@supabase/supabase-js'
import { BlobServiceClient } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'

// ── CLI flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SINGLE_BUCKET = (() => {
  const idx = args.indexOf('--bucket')
  return idx !== -1 ? args[idx + 1] : null
})()

// ── Env validation ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME

const missing = [
  !SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  !AZURE_STORAGE_ACCOUNT_NAME && 'AZURE_STORAGE_ACCOUNT_NAME',
].filter(Boolean)

if (missing.length) {
  console.error('Missing required environment variables:')
  missing.forEach(v => console.error(`  ${v}`))
  process.exit(1)
}

// ── Bucket order: lowest PHI risk → highest ────────────────────────────────
const ALL_BUCKETS = [
  'agency-public',
  'license-templates',
  'application-documents',
  'agency-documents',
  'lead-documents',
  'staff-member-documents',
  'patient-documents',
]

const BUCKETS = SINGLE_BUCKET
  ? ALL_BUCKETS.filter(b => b === SINGLE_BUCKET)
  : ALL_BUCKETS

if (SINGLE_BUCKET && BUCKETS.length === 0) {
  console.error(`Unknown bucket: ${SINGLE_BUCKET}`)
  console.error(`Valid buckets: ${ALL_BUCKETS.join(', ')}`)
  process.exit(1)
}

// ── Clients ────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const azureAccountUrl = `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`
const credential = new DefaultAzureCredential()
const blobServiceClient = new BlobServiceClient(azureAccountUrl, credential)

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Recursively list every file path in a Supabase Storage bucket.
 * Supabase list() returns: items with id !== null = files, id === null = folders.
 */
async function listAllFiles(bucket, prefix = '') {
  const paths = []

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix || undefined, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })

  if (error) {
    console.error(`\n  [list error] ${bucket}/${prefix}: ${error.message}`)
    return paths
  }

  if (!data?.length) return paths

  for (const item of data) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name

    if (item.id !== null) {
      // File
      paths.push(itemPath)
    } else {
      // Folder — recurse
      const nested = await listAllFiles(bucket, itemPath)
      paths.push(...nested)
    }
  }

  return paths
}

/**
 * Migrate one bucket. Returns { bucket, total, copied, skipped, failed }.
 */
async function migrateBucket(bucket) {
  console.log(`\n━━━ ${bucket} ━━━`)

  const containerClient = blobServiceClient.getContainerClient(bucket)

  if (!DRY_RUN) {
    await containerClient.createIfNotExists()
  }

  console.log('  Listing Supabase Storage files...')
  const files = await listAllFiles(bucket)
  console.log(`  Found ${files.length} file(s)${DRY_RUN ? ' (dry run — no transfers)' : ''}`)

  let copied = 0
  let skipped = 0
  let failed = 0

  for (const filePath of files) {
    if (DRY_RUN) {
      console.log(`  [dry] ${filePath}`)
      continue
    }

    const blobClient = containerClient.getBlockBlobClient(filePath)

    // Idempotency: skip files already present in Azure
    let exists = false
    try {
      exists = await blobClient.exists()
    } catch {
      // treat check failure as not-exists, attempt copy anyway
    }

    if (exists) {
      skipped++
      process.stdout.write('·')
      continue
    }

    // Download from Supabase Storage
    const { data: blob, error: dlErr } = await supabase.storage
      .from(bucket)
      .download(filePath)

    if (dlErr || !blob) {
      console.error(`\n  [download fail] ${filePath}: ${dlErr?.message ?? 'empty response'}`)
      failed++
      continue
    }

    const buffer = Buffer.from(await blob.arrayBuffer())

    // Upload to Azure Blob
    try {
      await blobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType: blob.type || 'application/octet-stream',
        },
      })
      copied++
      process.stdout.write('+')
    } catch (upErr) {
      console.error(`\n  [upload fail] ${filePath}: ${upErr.message}`)
      failed++
    }
  }

  if (!DRY_RUN) {
    console.log(`\n  ✓ copied: ${copied}  skipped: ${skipped}  failed: ${failed}`)
  }

  return { bucket, total: files.length, copied, skipped, failed }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Supabase Storage → Azure Blob Storage migration')
  if (DRY_RUN) console.log('*** DRY RUN — no files will be transferred ***')
  console.log(`Source : ${SUPABASE_URL}`)
  console.log(`Dest   : ${azureAccountUrl}`)
  console.log(`Buckets: ${BUCKETS.join(', ')}`)

  const results = []
  for (const bucket of BUCKETS) {
    results.push(await migrateBucket(bucket))
  }

  if (DRY_RUN) return

  console.log('\n\n━━━ Summary ━━━')
  let totalTotal = 0, totalCopied = 0, totalSkipped = 0, totalFailed = 0
  for (const r of results) {
    console.log(
      `  ${r.bucket.padEnd(26)} ${String(r.total).padStart(4)} files  ` +
      `copied: ${r.copied}  skipped: ${r.skipped}  failed: ${r.failed}`
    )
    totalTotal   += r.total
    totalCopied  += r.copied
    totalSkipped += r.skipped
    totalFailed  += r.failed
  }
  console.log(
    `  ${'TOTAL'.padEnd(26)} ${String(totalTotal).padStart(4)} files  ` +
    `copied: ${totalCopied}  skipped: ${totalSkipped}  failed: ${totalFailed}`
  )

  if (totalFailed > 0) {
    console.error(`\n⚠  ${totalFailed} file(s) failed. Re-run to retry — already-copied files will be skipped.`)
    process.exit(1)
  } else {
    console.log('\n✓ All files migrated successfully.')
  }
}

main().catch(err => {
  console.error('\nFatal:', err.message ?? err)
  process.exit(1)
})
