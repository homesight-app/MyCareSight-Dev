import type { Db } from './db.js'
import { addUtcDays } from './dates.js'
import { sendTaskReminder } from './email.js'

type Work = { id:string; job_name:string; subject_id:string; recipient_user_id:string|null; status:string; schedule_key:string }

async function loadWork(db: Db, outboxId: string): Promise<Work | null> {
  const rows=await db<Work[]>`
    WITH claimed AS (
      UPDATE background_job_items item
      SET status='processing',attempt_count=item.attempt_count+1,
          lease_expires_at=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
      FROM background_job_outbox outbox
      WHERE outbox.id=${outboxId} AND item.id=outbox.job_item_id
        AND (item.status IN ('pending','queued','retry')
          OR (item.status='processing' AND item.lease_expires_at<clock_timestamp()))
      RETURNING item.id,item.job_name,item.subject_id,item.recipient_user_id,item.status,item.run_id
    )
    SELECT claimed.id,claimed.job_name,claimed.subject_id,claimed.recipient_user_id,
      claimed.status,run.schedule_key FROM claimed JOIN background_job_runs run ON run.id=claimed.run_id
  `
  return rows[0]??null
}

export async function processQueueItem(db: Db, outboxId: string) {
  const work=await loadWork(db,outboxId)
  if (!work || ['succeeded','skipped','dead_letter'].includes(work.status)) return { skipped:true }
  if (work.job_name==='refill-visit-series') return refillSeries(db,work)
  if (work.job_name==='deliver-lead-task-reminder') return deliverReminder(db,work)
  throw Object.assign(new Error('Unknown job'),{code:'UNKNOWN_JOB_NAME'})
}

async function refillSeries(db: Db, work: Work) {
  const target=addUtcDays(work.schedule_key,21)
  return db.begin(async tx => {
    const [item]=await tx<{ status:string }[]>`SELECT status FROM background_job_items WHERE id=${work.id} FOR UPDATE`
    if (!item || ['succeeded','skipped'].includes(item.status)) return { skipped:true }
    const rows=await tx<any[]>`
      SELECT series.id,series.agency_id,series.patient_id,series.primary_caregiver_member_id,
        series.contract_id,series.service_type,series.series_name,series.repeat_end,series.notes,
        series.end_day_offset,template.id AS template_id, template.caregiver_member_id AS template_caregiver,
        template.scheduled_start_time,template.scheduled_end_time,template.description,
        template.notes AS template_notes,template.visit_type,template.patient_address_id,template.mileage_miles
      FROM visit_series series
      JOIN LATERAL (
        SELECT visit.id, visit.caregiver_member_id, visit.scheduled_start_time,
          visit.scheduled_end_time, visit.description, visit.notes, visit.visit_type,
          visit.patient_address_id, visit.mileage_miles
        FROM scheduled_visits visit
        WHERE visit.visit_series_id=series.id
        ORDER BY visit.visit_date,visit.id
        LIMIT 1
      ) template ON true
      WHERE series.id=${work.subject_id} AND series.status='active'
    `
    const series=rows[0]
    if (!series || (series.repeat_end && target>String(series.repeat_end).slice(0,10))) {
      await tx`UPDATE background_job_items SET status='skipped',completed_at=clock_timestamp(),
        lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=${work.id}`
      return { skipped:true }
    }
    const conflicts=await tx<{id:string}[]>`SELECT id FROM scheduled_visits
      WHERE agency_id=${series.agency_id} AND patient_id=${series.patient_id} AND visit_date=${target}::date
        AND status NOT IN ('completed','missed')
        AND scheduled_start_time < ${series.scheduled_end_time}::time
        AND scheduled_end_time > ${series.scheduled_start_time}::time LIMIT 1`
    if (conflicts.length) {
      await tx`UPDATE background_job_items SET status='skipped',last_error_code='PATIENT_TIME_OVERLAP',
        completed_at=clock_timestamp(),lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=${work.id}`
      return { skipped:true }
    }
    const inserted=await tx<{id:string}[]>`INSERT INTO scheduled_visits
      (agency_id,visit_series_id,patient_id,caregiver_member_id,contract_id,service_type,visit_date,
       scheduled_start_time,scheduled_end_time,description,notes,visit_type,status,is_recurring,
       patient_address_id,mileage_miles,scheduled_end_date)
      VALUES (${series.agency_id},${series.id},${series.patient_id},
       ${series.primary_caregiver_member_id??series.template_caregiver},${series.contract_id},${series.service_type},${target}::date,
       ${series.scheduled_start_time},${series.scheduled_end_time},${series.description},
       ${series.template_notes??series.notes},${series.visit_type??series.series_name},'scheduled',true,
       ${series.patient_address_id},${series.mileage_miles},
       CASE WHEN ${series.end_day_offset}>0 THEN ${target}::date+${series.end_day_offset}::int ELSE NULL END)
      ON CONFLICT (visit_series_id,visit_date) WHERE visit_series_id IS NOT NULL
      DO NOTHING RETURNING id`
    if (!inserted[0]) {
      await tx`UPDATE background_job_items SET status='skipped',completed_at=clock_timestamp(),
        lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=${work.id}`
      return { skipped:true }
    }
    await tx`INSERT INTO scheduled_visit_tasks (agency_id,scheduled_visit_id,task_id,legacy_task_code,sort_order,notes)
      SELECT ${series.agency_id},${inserted[0].id},task_id,legacy_task_code,sort_order,notes
      FROM scheduled_visit_tasks WHERE scheduled_visit_id=${series.template_id} ORDER BY sort_order,id`
    await tx`UPDATE background_job_items SET status='succeeded',result_record_id=${inserted[0].id},
      completed_at=clock_timestamp(),lease_expires_at=NULL,last_error_code=NULL,updated_at=clock_timestamp() WHERE id=${work.id}`
    return { skipped:false }
  })
}

async function deliverReminder(db: Db, work: Work) {
  if (!work.recipient_user_id) throw Object.assign(new Error('Missing recipient'),{code:'MISSING_RECIPIENT'})
  const rows=await db<{email:string; notification_id:string|null}[]>`
    SELECT profile.email,item.result_record_id AS notification_id FROM background_job_items item
    JOIN lead_tasks task ON task.id=item.subject_id AND task.completed_at IS NULL
    JOIN user_profiles profile ON profile.id=item.recipient_user_id AND profile.is_active=true
    WHERE item.id=${work.id}`
  if (!rows[0]) {
    await db`UPDATE background_job_items SET status='skipped',completed_at=clock_timestamp(),
      updated_at=clock_timestamp() WHERE id=${work.id}`
    return { skipped:true }
  }
  const notificationId=rows[0].notification_id ?? await db.begin(async tx => {
    const [locked]=await tx<{result_record_id:string|null}[]>`
      SELECT result_record_id FROM background_job_items WHERE id=${work.id} FOR UPDATE`
    if (locked.result_record_id) return locked.result_record_id
    const [created]=await tx<{id:string}[]>`INSERT INTO notifications(user_id,title,type,message,icon_type,action_url)
      VALUES (${work.recipient_user_id},'Task due','task_due','A task is due. Sign in to review it.',
        'calendar','/pages/agency/leads') RETURNING id`
    await tx`UPDATE background_job_items SET result_record_id=${created.id},updated_at=clock_timestamp()
      WHERE id=${work.id}`
    return created.id
  })
  await sendTaskReminder(rows[0].email,work.id)
  await db`UPDATE background_job_items SET status='succeeded',completed_at=clock_timestamp(),
    lease_expires_at=NULL,last_error_code=NULL,updated_at=clock_timestamp() WHERE id=${work.id}`
  return { skipped:false }
}

export async function recordFailure(db: Db, outboxId: string, code: string) {
  await db`UPDATE background_job_items item SET
    status=CASE WHEN item.attempt_count>=5 THEN 'dead_letter' ELSE 'retry' END,
    available_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(item.attempt_count,7)))::int),
    lease_expires_at=NULL,last_error_code=${code},updated_at=clock_timestamp()
    FROM background_job_outbox outbox WHERE outbox.id=${outboxId} AND item.id=outbox.job_item_id`
}
