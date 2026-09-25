import type { Db } from './db.js'
import { finishRun, startRun, withRunFailure } from './job-control.js'
import { jobQueue } from './queue.js'

export async function dispatchOutbox(db: Db, batchSize = 100, now = new Date()) {
  const scheduleKey=now.toISOString().slice(0,16)
  const runId=await startRun(db,'dispatch-job-outbox',scheduleKey,now,process.env.WEBSITE_COMMIT_SHA??null)
  if (!runId) return { duplicate:true, claimed:0, published:0, failed:0 }
  return withRunFailure(db,runId,async()=>{
    const claimed = await db<{ id:string }[]>`
    WITH candidates AS (
      SELECT id FROM background_job_outbox
      WHERE status IN ('pending','retry') AND available_at <= clock_timestamp()
        AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
      ORDER BY available_at, created_at, id
      FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
    )
    UPDATE background_job_outbox outbox
    SET status='publishing', attempt_count=attempt_count+1,
        lease_expires_at=clock_timestamp()+interval '2 minutes', updated_at=clock_timestamp()
    FROM candidates WHERE outbox.id=candidates.id
    RETURNING outbox.id
  `
    const queue = jobQueue()
    let published=0, failed=0
    for (const row of claimed) {
      try {
        await queue.sendMessage(JSON.stringify({ outboxId: row.id }))
        await db`UPDATE background_job_outbox SET status='published', published_at=clock_timestamp(),
          lease_expires_at=NULL, last_error_code=NULL, updated_at=clock_timestamp() WHERE id=${row.id}`
        await db`UPDATE background_job_items item SET status='queued', updated_at=clock_timestamp()
          FROM background_job_outbox outbox WHERE outbox.id=${row.id} AND item.id=outbox.job_item_id
            AND item.status IN ('pending','retry')`
        published++
      } catch {
        await db`UPDATE background_job_outbox SET
          status=CASE WHEN attempt_count>=5 THEN 'dead_letter' ELSE 'retry' END,
          available_at=clock_timestamp()+make_interval(secs => least(3600, 30*power(2,least(attempt_count,7)))::int),
          lease_expires_at=NULL, last_error_code='QUEUE_PUBLISH_FAILED', updated_at=clock_timestamp()
          WHERE id=${row.id}`
        failed++
      }
    }
    await finishRun(db,runId,{examined:claimed.length,queued:published,succeeded:published,failed},
      failed>0?'partially_failed':'succeeded',failed>0?'QUEUE_PUBLISH_FAILED':null)
    return { duplicate:false, claimed:claimed.length, published, failed }
  })
}
