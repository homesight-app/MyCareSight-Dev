import fs from 'node:fs'
import path from 'node:path'

const envPath = path.resolve('..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
  if (!match) continue
  let value = match[2].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  process.env[match[1]] = value
}

if (!process.env.JOBS_DATABASE_URL) throw new Error('JOBS_DATABASE_URL is missing')

const [{ sql }, { processQueueItem }] = await Promise.all([
  import('../dist/db.js'),
  import('../dist/worker.js'),
])

try {
  const pending = await sql`
    SELECT outbox.id
    FROM background_job_outbox outbox
    JOIN background_job_items item ON item.id = outbox.job_item_id
    JOIN background_job_runs run ON run.id = item.run_id
    WHERE outbox.published_at IS NULL
      AND item.job_name = 'refill-visit-series'
      AND (
        item.status IN ('pending', 'retry')
        OR (item.status = 'processing' AND item.lease_expires_at < clock_timestamp())
      )
      AND item.available_at <= clock_timestamp()
      AND run.schedule_key = current_date::text
    ORDER BY outbox.created_at, outbox.id
    LIMIT 10
  `

  let firstSucceeded = 0
  let firstSkipped = 0
  let secondSkipped = 0
  for (const row of pending) {
    const first = await processQueueItem(sql, row.id)
    if (first.skipped) firstSkipped++
    else firstSucceeded++
    const second = await processQueueItem(sql, row.id)
    if (second.skipped) secondSkipped++
  }

  const [summary] = await sql`
    SELECT
      count(*) FILTER (WHERE item.status = 'succeeded')::integer AS succeeded_items,
      count(*) FILTER (WHERE item.status = 'skipped')::integer AS skipped_items,
      count(*) FILTER (WHERE item.result_record_id IS NOT NULL)::integer AS result_records,
      count(*) FILTER (WHERE item.status IN ('retry', 'dead_letter'))::integer AS failed_items
    FROM background_job_items item
    JOIN background_job_runs run ON run.id = item.run_id
    WHERE item.job_name = 'refill-visit-series'
      AND run.schedule_key = current_date::text
  `

  console.log(JSON.stringify({
    selected: pending.length,
    firstSucceeded,
    firstSkipped,
    secondSkipped,
    summary,
  }))
} finally {
  await sql.end()
}
