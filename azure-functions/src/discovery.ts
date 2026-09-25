import type { Db } from './db.js'
import { addUtcDays, utcDate, utcWeekday } from './dates.js'
import { enqueueItem, finishRun, startRun, withRunFailure } from './job-control.js'

const VERSION = process.env.WEBSITE_COMMIT_SHA ?? null

export async function discoverVisitRefills(db: Db, now = new Date()) {
  const today = utcDate(now)
  const target = addUtcDays(today, 21)
  const runId = await startRun(db, 'discover-visit-series-refill', today, now, VERSION)
  if (!runId) return { duplicate: true, examined: 0, queued: 0 }
  return withRunFailure(db,runId,async()=>{
    const series = await db<{ id: string; agency_id: string }[]>`
    SELECT id, agency_id FROM visit_series
    WHERE status='active' AND lower(coalesce(repeat_frequency,''))='weekly'
      AND repeat_start <= ${today}::date
      AND (${target}::date <= repeat_end OR repeat_end IS NULL)
      AND ${utcWeekday(today)} = ANY(days_of_week)
    ORDER BY agency_id, id
    LIMIT 10000
  `
    let queued = 0
    for (const row of series) {
      if (await enqueueItem(db, { runId, jobName:'refill-visit-series', agencyId:row.agency_id,
        subjectType:'visit_series', subjectId:row.id, key:`refill:${row.id}:${target}` })) queued++
    }
    await finishRun(db, runId, { examined: series.length, queued })
    return { duplicate: false, examined: series.length, queued }
  })
}

export async function discoverLeadReminders(db: Db, now = new Date()) {
  const today = utcDate(now)
  const runId = await startRun(db, 'discover-lead-task-reminders', today, now, VERSION)
  if (!runId) return { duplicate: true, examined: 0, queued: 0 }
  return withRunFailure(db,runId,async()=>{
    const rows = await db<{ task_id:string; agency_id:string|null; recipient_id:string }[]>`
    SELECT task.id AS task_id, lead.agency_id, recipient.recipient_id
    FROM lead_tasks task
    JOIN leads lead ON lead.id=task.lead_id
    CROSS JOIN LATERAL (
      SELECT DISTINCT recipient_id FROM unnest(ARRAY[task.created_by, task.assigned_to]) recipient_id
      WHERE recipient_id IS NOT NULL
    ) recipient
    JOIN user_profiles profile ON profile.id=recipient.recipient_id AND profile.is_active=true
    WHERE task.due_date=${today}::date AND task.completed_at IS NULL
    ORDER BY lead.agency_id, task.id, recipient.recipient_id
    LIMIT 25000
  `
    let queued=0
    for (const row of rows) {
      if (await enqueueItem(db, { runId, jobName:'deliver-lead-task-reminder', agencyId:row.agency_id,
        subjectType:'lead_task_recipient', subjectId:row.task_id, recipientId:row.recipient_id,
        key:`reminder:${row.task_id}:${row.recipient_id}:${today}` })) queued++
    }
    await finishRun(db, runId, { examined: rows.length, queued })
    return { duplicate:false, examined:rows.length, queued }
  })
}
