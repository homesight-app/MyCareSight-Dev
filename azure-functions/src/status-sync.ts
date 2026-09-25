import type { Db } from './db.js'
import { finishRun, startRun, withRunFailure } from './job-control.js'

export async function syncVisitStatuses(db: Db, now = new Date()) {
  const scheduleKey = now.toISOString().slice(0, 16)
  const runId = await startRun(db, 'sync-visit-statuses', scheduleKey, now, process.env.WEBSITE_COMMIT_SHA ?? null)
  if (!runId) return { duplicate:true, changed:0 }
  return withRunFailure(db,runId,async()=>{
    const rows = await db<{ changed:number }[]>`SELECT sync_scheduled_visit_statuses(NULL,NULL,NULL) AS changed`
    const changed = Number(rows[0]?.changed ?? 0)
    await finishRun(db, runId, { examined:changed, queued:0, succeeded:changed })
    return { duplicate:false, changed }
  })
}
