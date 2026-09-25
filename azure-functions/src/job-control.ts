import type { Db } from './db.js'

export async function startRun(
  db: Db,
  jobName: string,
  scheduleKey: string,
  scheduledFor: Date,
  codeVersion: string | null
): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO background_job_runs (job_name, schedule_key, scheduled_for, code_version)
    VALUES (${jobName}, ${scheduleKey}, ${scheduledFor}, ${codeVersion})
    ON CONFLICT (job_name, schedule_key) DO NOTHING
    RETURNING id
  `
  return rows[0]?.id ?? null
}

export async function finishRun(
  db: Db,
  runId: string,
  counts: { examined: number; queued: number; succeeded?: number; skipped?: number; failed?: number },
  status: 'succeeded' | 'partially_failed' | 'failed' = 'succeeded',
  errorCode: string | null = null
) {
  await db`
    UPDATE background_job_runs
    SET status=${status}, examined_count=${counts.examined}, queued_count=${counts.queued},
        succeeded_count=${counts.succeeded ?? 0}, skipped_count=${counts.skipped ?? 0},
        failed_count=${counts.failed ?? 0}, error_code=${errorCode}, finished_at=clock_timestamp()
    WHERE id=${runId}
  `
}

export async function withRunFailure<T>(db: Db, runId: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    try {
      await finishRun(db, runId, { examined:0, queued:0 }, 'failed', 'JOB_EXECUTION_FAILED')
    } catch {}
    throw error
  }
}

export async function enqueueItem(
  db: Db,
  input: { runId: string; jobName: string; agencyId: string | null; subjectType: string; subjectId: string; recipientId?: string; key: string }
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    WITH item AS (
      INSERT INTO background_job_items
        (run_id, job_name, agency_id, subject_type, subject_id, recipient_user_id, idempotency_key)
      VALUES (${input.runId}, ${input.jobName}, ${input.agencyId}, ${input.subjectType},
              ${input.subjectId}, ${input.recipientId ?? null}, ${input.key})
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    )
    INSERT INTO background_job_outbox (job_item_id)
    SELECT id FROM item
    RETURNING id
  `
  return rows.length === 1
}
