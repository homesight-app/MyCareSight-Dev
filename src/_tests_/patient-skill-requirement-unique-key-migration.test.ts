/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/023-patient-skill-requirement-unique-key.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/023-verify-patient-skill-requirement-unique-key.sql'),
  'utf8'
)

const AGENCY = '92000000-0000-4000-8000-000000000001'
const PATIENT = '92000000-0000-4000-8000-000000000002'

async function createDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE agencies (id uuid PRIMARY KEY);
    CREATE TABLE patients (
      id uuid PRIMARY KEY,
      agency_id uuid NOT NULL REFERENCES agencies(id)
    );
    CREATE TABLE patient_skill_requirements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid NOT NULL REFERENCES agencies(id),
      patient_id uuid NOT NULL REFERENCES patients(id),
      skill_codes text[] NOT NULL DEFAULT '{}',
      preferred_skill_codes text[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO agencies VALUES ('${AGENCY}');
    INSERT INTO patients VALUES ('${PATIENT}', '${AGENCY}');
  `)
  return db
}

describe('patient skill requirement unique-key migration 023', () => {
  test('adds the missing patient key and enables atomic upsert', async () => {
    const db = await createDatabase()
    try {
      await db.exec(migration)
      const results = await db.exec(verification)
      const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
      expect(row).toEqual({
        one_requirement_per_patient_key_ok: true,
        duplicate_patient_count: 0,
        agency_mismatch_count: 0,
      })

      await db.query(
        `INSERT INTO patient_skill_requirements
           (agency_id, patient_id, skill_codes, preferred_skill_codes)
         VALUES ($1, $2, ARRAY['Wound Care'], '{}')
         ON CONFLICT (patient_id)
         DO UPDATE SET preferred_skill_codes = ARRAY['Spanish'], updated_at = now()`,
        [AGENCY, PATIENT]
      )
      await db.query(
        `INSERT INTO patient_skill_requirements
           (agency_id, patient_id, skill_codes, preferred_skill_codes)
         VALUES ($1, $2, ARRAY['Wound Care'], '{}')
         ON CONFLICT (patient_id)
         DO UPDATE SET preferred_skill_codes = ARRAY['Spanish'], updated_at = now()`,
        [AGENCY, PATIENT]
      )

      const saved = await db.query(
        `SELECT preferred_skill_codes,
                count(*) OVER ()::integer AS row_count
         FROM patient_skill_requirements
         WHERE patient_id = $1`,
        [PATIENT]
      )
      expect(saved.rows).toEqual([{ preferred_skill_codes: ['Spanish'], row_count: 1 }])
    } finally {
      await db.close()
    }
  })

  test('fails without changing data when duplicate client rows exist', async () => {
    const db = await createDatabase()
    try {
      await db.exec(`
        INSERT INTO patient_skill_requirements
          (agency_id, patient_id, skill_codes, preferred_skill_codes)
        VALUES
          ('${AGENCY}', '${PATIENT}', ARRAY['Wound Care'], '{}'),
          ('${AGENCY}', '${PATIENT}', '{}', ARRAY['Spanish']);
      `)

      await expect(db.exec(migration)).rejects.toThrow(
        'clients with duplicate patient_skill_requirements rows'
      )
      await db.exec('ROLLBACK')

      const remaining = await db.query(
        'SELECT count(*)::integer AS row_count FROM patient_skill_requirements'
      )
      expect(remaining.rows).toEqual([{ row_count: 2 }])
    } finally {
      await db.close()
    }
  })
})
