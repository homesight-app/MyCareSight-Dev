import sql from '@/db'

/** One row per assigned ADL (day_of_week = 1 in patient_care_plan_tasks). */
export interface PatientAdl {
  id: string
  patient_id: string
  adl_code: string
  display_order: number
  created_at: string
  updated_at: string
}

export interface PatientAdlDaySchedule {
  id: string
  patient_id: string
  adl_code: string
  day_of_week: number
  adl_note: string | null
  schedule_type: 'never' | 'always' | 'as_needed' | 'specific_times'
  times_per_day: number | null
  slot_morning: string | null
  slot_afternoon: string | null
  slot_evening: string | null
  slot_night: string | null
  display_order: number
  created_at: string
  updated_at: string
}

function mapTaskToAdl(row: {
  id: string
  patient_id: string
  legacy_task_code: string | null
  display_order: number | null
  created_at: string
  updated_at: string
}): PatientAdl {
  return {
    id: row.id,
    patient_id: row.patient_id,
    adl_code: row.legacy_task_code ?? '',
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapTaskToDaySchedule(row: {
  id: string
  patient_id: string
  legacy_task_code: string | null
  day_of_week: number
  task_note: string | null
  schedule_type: string | null
  times_per_day: number | null
  slot_morning: string | null
  slot_afternoon: string | null
  slot_evening: string | null
  slot_night: string | null
  display_order: number | null
  created_at: string
  updated_at: string
}): PatientAdlDaySchedule {
  return {
    id: row.id,
    patient_id: row.patient_id,
    adl_code: row.legacy_task_code ?? '',
    day_of_week: row.day_of_week,
    adl_note: row.task_note,
    schedule_type: (row.schedule_type as PatientAdlDaySchedule['schedule_type']) || 'never',
    times_per_day: row.times_per_day,
    slot_morning: row.slot_morning,
    slot_afternoon: row.slot_afternoon,
    slot_evening: row.slot_evening,
    slot_night: row.slot_night,
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function requireAgencyIdForPatient(patientId: string): Promise<string> {
  const rows = await sql`SELECT agency_id FROM patients WHERE id = ${patientId} LIMIT 1`
  const agencyId = rows[0]?.agency_id as string | null
  if (!agencyId) throw new Error('Patient has no agency_id')
  return agencyId
}

/** Assigned ADLs for a patient (day_of_week = 1), ordered by display_order. */
export async function getAdlsByPatientId(patientId: string) {
  try {
    const rows = await sql`
      SELECT *
      FROM patient_care_plan_tasks
      WHERE patient_id = ${patientId}
        AND service_type = 'non_skilled'
        AND day_of_week = 1
      ORDER BY display_order ASC, created_at ASC
    `
    return {
      data: rows.map((r) => mapTaskToAdl(r as Parameters<typeof mapTaskToAdl>[0])),
      error: null,
    }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
  }
}

/** Insert one ADL: upsert 7 rows (days 1–7) with schedule_type never. */
export async function insertAdl(
  data: { patient_id: string; adl_code: string; display_order?: number }
) {
  try {
    const agencyId = await requireAgencyIdForPatient(data.patient_id)
    const displayOrder = data.display_order ?? 0
    const rows = [1, 2, 3, 4, 5, 6, 7].map((day_of_week) => ({
      agency_id: agencyId,
      patient_id: data.patient_id,
      legacy_task_code: data.adl_code,
      day_of_week,
      schedule_type: 'never' as const,
      service_type: 'non_skilled' as const,
      display_order: displayOrder,
    }))

    await sql`
      INSERT INTO patient_care_plan_tasks ${sql(rows)}
      ON CONFLICT (patient_id, legacy_task_code, day_of_week) DO NOTHING
    `

    const dayOneRows = await sql`
      SELECT *
      FROM patient_care_plan_tasks
      WHERE patient_id = ${data.patient_id}
        AND service_type = 'non_skilled'
        AND legacy_task_code = ${data.adl_code}
        AND day_of_week = 1
      LIMIT 1
    `
    return {
      data: dayOneRows[0] ? mapTaskToAdl(dayOneRows[0] as Parameters<typeof mapTaskToAdl>[0]) : null,
      error: null,
    }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
  }
}

/** Insert multiple ADLs; returns day_of_week=1 rows for list display. */
export async function insertAdls(
  patientId: string,
  adlCodes: string[],
  startDisplayOrder: number = 0
) {
  if (adlCodes.length === 0) return { data: [], error: null }
  try {
    const agencyId = await requireAgencyIdForPatient(patientId)
    const allRows: {
      agency_id: string
      patient_id: string
      legacy_task_code: string
      day_of_week: number
      schedule_type: 'never'
      service_type: 'non_skilled'
      display_order: number
    }[] = []
    adlCodes.forEach((adl_code, i) => {
      const displayOrder = startDisplayOrder + i
      for (let d = 1; d <= 7; d++) {
        allRows.push({
          agency_id: agencyId,
          patient_id: patientId,
          legacy_task_code: adl_code,
          day_of_week: d,
          schedule_type: 'never',
          service_type: 'non_skilled',
          display_order: displayOrder,
        })
      }
    })

    await sql`
      INSERT INTO patient_care_plan_tasks ${sql(allRows)}
      ON CONFLICT (patient_id, legacy_task_code, day_of_week) DO NOTHING
    `

    const dayOneRows = await sql`
      SELECT *
      FROM patient_care_plan_tasks
      WHERE patient_id = ${patientId}
        AND service_type = 'non_skilled'
        AND day_of_week = 1
        AND legacy_task_code IN ${sql(adlCodes)}
      ORDER BY display_order ASC
    `
    return {
      data: dayOneRows.map((r) => mapTaskToAdl(r as Parameters<typeof mapTaskToAdl>[0])),
      error: null,
    }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
  }
}

/** Delete all day rows for one ADL code. Returns an error if the server deletes 0 rows (RLS or bad code). */
export async function deleteAdl(patientId: string, adlCode: string) {
  try {
    const deleted = await sql`
      DELETE FROM patient_care_plan_tasks
      WHERE patient_id = ${patientId}
        AND service_type = 'non_skilled'
        AND legacy_task_code = ${adlCode}
      RETURNING id
    `
    if (deleted.length === 0) {
      return {
        data: null,
        error: new Error(
          `Could not remove "${adlCode}" from the care plan (no rows deleted). Your account may not have permission to remove tasks.`
        ),
      }
    }
    return { data: deleted, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/** All per-day schedules for a patient. */
export async function getPatientAdlDaySchedulesByPatientId(patientId: string) {
  try {
    const rows = await sql`
      SELECT *
      FROM patient_care_plan_tasks
      WHERE patient_id = ${patientId}
        AND service_type = 'non_skilled'
    `
    return {
      data: rows.map((r) => mapTaskToDaySchedule(r as Parameters<typeof mapTaskToDaySchedule>[0])),
      error: null,
    }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
  }
}

/** Payload for upserting non-skilled per-day rows on `patient_care_plan_tasks`. */
export type PatientAdlDayScheduleUpsert = {
  patient_id: string
  adl_code: string
  day_of_week: number
  display_order?: number
  adl_note?: string | null
  schedule_type: 'never' | 'always' | 'as_needed' | 'specific_times'
  times_per_day?: number | null
  slot_morning?: string | null
  slot_afternoon?: string | null
  slot_evening?: string | null
  slot_night?: string | null
}

/**
 * Batch upsert all ADL day schedules in one round-trip (one `agency_id` lookup).
 * Prefer this over looping `upsertPatientAdlDaySchedule` from the client save path.
 */
export async function upsertPatientAdlDaySchedulesBatch(
  patientId: string,
  rows: PatientAdlDayScheduleUpsert[]
): Promise<{ error: Error | null }> {
  if (rows.length === 0) return { error: null }
  try {
    const agencyId = await requireAgencyIdForPatient(patientId)
    const payloads = rows.map((data) => ({
      agency_id: agencyId,
      patient_id: data.patient_id,
      legacy_task_code: data.adl_code,
      day_of_week: data.day_of_week,
      display_order: data.display_order ?? 0,
      service_type: 'non_skilled' as const,
      task_note: data.adl_note ?? null,
      schedule_type: data.schedule_type,
      times_per_day: data.times_per_day ?? null,
      slot_morning: data.slot_morning ?? null,
      slot_afternoon: data.slot_afternoon ?? null,
      slot_evening: data.slot_evening ?? null,
      slot_night: data.slot_night ?? null,
    }))

    const chunkSize = 250
    for (let i = 0; i < payloads.length; i += chunkSize) {
      const chunk = payloads.slice(i, i + chunkSize)
      await sql`
        INSERT INTO patient_care_plan_tasks ${sql(chunk)}
        ON CONFLICT (patient_id, legacy_task_code, day_of_week)
        DO UPDATE SET
          display_order  = EXCLUDED.display_order,
          service_type   = EXCLUDED.service_type,
          task_note      = EXCLUDED.task_note,
          schedule_type  = EXCLUDED.schedule_type,
          times_per_day  = EXCLUDED.times_per_day,
          slot_morning   = EXCLUDED.slot_morning,
          slot_afternoon = EXCLUDED.slot_afternoon,
          slot_evening   = EXCLUDED.slot_evening,
          slot_night     = EXCLUDED.slot_night
      `
    }
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/** Upsert one day row (patient_id, legacy ADL code, day_of_week). */
export async function upsertPatientAdlDaySchedule(data: PatientAdlDayScheduleUpsert) {
  return upsertPatientAdlDaySchedulesBatch(data.patient_id, [data])
}

export async function updatePatientAdlDaySchedule(
  data: {
    id: string
    adl_note?: string | null
  }
) {
  try {
    const rows = await sql`
      UPDATE patient_care_plan_tasks
      SET task_note = ${data.adl_note ?? null}
      WHERE id = ${data.id}
      RETURNING *
    `
    if (!rows[0]) throw new Error('Update did not return a row')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
  }
}

export async function deletePatientAdlDaySchedulesForAdl(
  patientId: string,
  adlCode: string
) {
  return deleteAdl(patientId, adlCode)
}
