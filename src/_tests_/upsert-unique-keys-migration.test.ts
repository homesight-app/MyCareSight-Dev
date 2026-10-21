/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/029-upsert-unique-keys.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/029-verify-upsert-unique-keys.sql'),
  'utf8'
)

const AGENCY = '93000000-0000-4000-8000-000000000001'
const LEAD = '93000000-0000-4000-8000-000000000002'

async function createDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.agency_configurations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid NOT NULL, label text
    );
    CREATE TABLE public.agency_lead_stages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid NOT NULL,
      key text NOT NULL, label text
    );
    CREATE TABLE public.patient_lead_details (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL, note text
    );
  `)
  return db
}

describe('three upsert unique-key migration 029', () => {
  test('restores all keys, enables upserts, and can be rerun', async () => {
    const db = await createDatabase()
    try {
      await db.query(
        `INSERT INTO public.agency_configurations (agency_id, label) VALUES ($1, 'before')`,
        [AGENCY]
      )
      await db.query(
        `INSERT INTO public.agency_lead_stages (agency_id, key, label) VALUES ($1, 'new', 'before')`,
        [AGENCY]
      )
      await db.query(
        `INSERT INTO public.patient_lead_details (lead_id, note) VALUES ($1, 'before')`,
        [LEAD]
      )
      await db.exec(migration)
      const verified = await db.query<{ table_name: string; key_ok: boolean; duplicate_groups: number }>(verification)
      expect(verified.rows).toEqual([
        { table_name: 'agency_configurations', key_ok: true, duplicate_groups: 0 },
        { table_name: 'agency_lead_stages', key_ok: true, duplicate_groups: 0 },
        { table_name: 'patient_lead_details', key_ok: true, duplicate_groups: 0 },
      ])

      await db.query(
        `INSERT INTO public.agency_configurations (agency_id, label)
         VALUES ($1, 'after') ON CONFLICT (agency_id) DO UPDATE SET label = EXCLUDED.label`,
        [AGENCY]
      )
      await db.query(
        `INSERT INTO public.agency_lead_stages (agency_id, key, label)
         VALUES ($1, 'new', 'after') ON CONFLICT (agency_id, key) DO UPDATE SET label = EXCLUDED.label`,
        [AGENCY]
      )
      await db.query(
        `INSERT INTO public.patient_lead_details (lead_id, note)
         VALUES ($1, 'after') ON CONFLICT (lead_id) DO UPDATE SET note = EXCLUDED.note`,
        [LEAD]
      )
      await db.exec(migration)
      const rows = await db.query<{ table_name: string; row_count: number }>(`
        SELECT 'agency_configurations' AS table_name, count(*)::integer AS row_count
          FROM public.agency_configurations
        UNION ALL SELECT 'agency_lead_stages', count(*)::integer FROM public.agency_lead_stages
        UNION ALL SELECT 'patient_lead_details', count(*)::integer FROM public.patient_lead_details
        ORDER BY table_name
      `)
      expect(rows.rows).toEqual([
        { table_name: 'agency_configurations', row_count: 1 },
        { table_name: 'agency_lead_stages', row_count: 1 },
        { table_name: 'patient_lead_details', row_count: 1 },
      ])
    } finally {
      await db.close()
    }
  })

  test.each([
    ['agency_configurations', `(agency_id) VALUES ('${AGENCY}'), ('${AGENCY}')`],
    ['agency_lead_stages', `(agency_id, key) VALUES ('${AGENCY}', 'new'), ('${AGENCY}', 'new')`],
    ['patient_lead_details', `(lead_id) VALUES ('${LEAD}'), ('${LEAD}')`],
  ])('rejects duplicates in %s without changing rows', async (table, values) => {
    const db = await createDatabase()
    try {
      await db.exec(`INSERT INTO public.${table} ${values};`)
      await expect(db.exec(migration)).rejects.toThrow('duplicate')
      await db.exec('ROLLBACK')
      const result = await db.query<{ row_count: number }>(
        `SELECT count(*)::integer AS row_count FROM public.${table}`
      )
      expect(result.rows).toEqual([{ row_count: 2 }])
    } finally {
      await db.close()
    }
  })
})
