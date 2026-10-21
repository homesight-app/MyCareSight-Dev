/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/027-patient-adl-day-unique-key.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/027-verify-patient-adl-day-unique-key.sql'),
  'utf8'
)

const PATIENT = '93000000-0000-4000-8000-000000000001'

async function createDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.patient_care_plan_tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL,
      legacy_task_code text,
      day_of_week integer NOT NULL,
      service_type text NOT NULL,
      task_note text
    );
  `)
  return db
}

describe('patient ADL day unique-key migration 027', () => {
  test('restores the source key and makes non-skilled schedule upserts work', async () => {
    const db = await createDatabase()
    try {
      await db.query(
        `INSERT INTO public.patient_care_plan_tasks
           (patient_id, legacy_task_code, day_of_week, service_type)
         VALUES ($1, 'Dressing', 1, 'non_skilled')`,
        [PATIENT]
      )
      await db.exec(migration)
      const result = await db.query<Record<string, unknown>>(verification)
      expect(result.rows[0]).toEqual({ key_ok: true, duplicate_groups: 0 })

      await db.query(
        `INSERT INTO public.patient_care_plan_tasks
           (patient_id, legacy_task_code, day_of_week, service_type, task_note)
         VALUES ($1, 'Dressing', 1, 'non_skilled', 'synthetic note')
         ON CONFLICT (patient_id, legacy_task_code, day_of_week)
         DO UPDATE SET task_note = EXCLUDED.task_note`,
        [PATIENT]
      )
      const saved = await db.query<{ row_count: number; task_note: string }>(
        `SELECT count(*)::integer AS row_count, max(task_note) AS task_note
         FROM public.patient_care_plan_tasks
         WHERE patient_id = $1 AND legacy_task_code = 'Dressing'`,
        [PATIENT]
      )
      expect(saved.rows).toEqual([{ row_count: 1, task_note: 'synthetic note' }])

      await db.query(
        `INSERT INTO public.patient_care_plan_tasks
           (patient_id, legacy_task_code, day_of_week, service_type)
         VALUES ($1, NULL, 1, 'skilled'), ($1, NULL, 1, 'skilled')`,
        [PATIENT]
      )
      await db.exec(migration)
      const repeated = await db.query<Record<string, unknown>>(verification)
      expect(repeated.rows[0]).toEqual({ key_ok: true, duplicate_groups: 0 })
    } finally {
      await db.close()
    }
  })

  test('rejects duplicate ADL day keys without removing either row', async () => {
    const db = await createDatabase()
    try {
      await db.query(
        `INSERT INTO public.patient_care_plan_tasks
           (patient_id, legacy_task_code, day_of_week, service_type)
         VALUES ($1, 'Feeding', 1, 'non_skilled'), ($1, 'Feeding', 1, 'non_skilled')`,
        [PATIENT]
      )
      await expect(db.exec(migration)).rejects.toThrow('duplicate ADL day keys')
      await db.exec('ROLLBACK')
      const remaining = await db.query<{ row_count: number }>(
        'SELECT count(*)::integer AS row_count FROM public.patient_care_plan_tasks'
      )
      expect(remaining.rows).toEqual([{ row_count: 2 }])
    } finally {
      await db.close()
    }
  })
})
