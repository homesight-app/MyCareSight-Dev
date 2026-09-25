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

const [{ sql }, { syncVisitStatuses }, { discoverVisitRefills, discoverLeadReminders }] = await Promise.all([
  import('../dist/db.js'),
  import('../dist/status-sync.js'),
  import('../dist/discovery.js'),
])

try {
  const now = new Date()
  const first = {
    status: await syncVisitStatuses(sql, now),
    refills: await discoverVisitRefills(sql, now),
    reminders: await discoverLeadReminders(sql, now),
  }
  const second = {
    status: await syncVisitStatuses(sql, now),
    refills: await discoverVisitRefills(sql, now),
    reminders: await discoverLeadReminders(sql, now),
  }
  const [summary] = await sql`
    SELECT
      count(*) FILTER (WHERE created_at >= ${now})::integer AS runs,
      (SELECT count(*)::integer FROM background_job_items WHERE created_at >= ${now}) AS items,
      (SELECT count(*)::integer FROM background_job_outbox WHERE created_at >= ${now}) AS outbox,
      bool_and(error_code IS NULL OR error_code ~ '^[A-Z0-9_:-]{1,100}$') AS safe_errors
    FROM background_job_runs WHERE created_at >= ${now}
  `
  console.log(JSON.stringify({ first, second, summary }))
} finally {
  await sql.end()
}
