/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/022-client-caregiver-skill-preferences.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/022-verify-client-caregiver-skill-preferences.sql'),
  'utf8'
)

const AGENCY = '91000000-0000-4000-8000-000000000001'
const OTHER_AGENCY = '91000000-0000-4000-8000-000000000002'
const MANAGER = '91000000-0000-4000-8000-000000000003'
const CAREGIVER = '91000000-0000-4000-8000-000000000004'
const PATIENT = '91000000-0000-4000-8000-000000000005'
const OTHER_PATIENT = '91000000-0000-4000-8000-000000000006'

describe('client caregiver skill preference migration 022', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE agencies (id uuid PRIMARY KEY);
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY, role text NOT NULL, agency_id uuid, is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE user_agency_roles (user_id uuid, agency_id uuid, role text, status text);
      CREATE TABLE patients (id uuid PRIMARY KEY, agency_id uuid NOT NULL REFERENCES agencies(id));
      CREATE TABLE credential_catalog (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE patient_skill_requirements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agency_id uuid NOT NULL REFERENCES agencies(id),
        patient_id uuid NOT NULL UNIQUE REFERENCES patients(id),
        skill_codes text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE FUNCTION visit_financial_manager_can_read(p_agency_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY INVOKER AS $$
        SELECT EXISTS (
          SELECT 1 FROM user_profiles profile
          JOIN user_agency_roles membership
            ON membership.user_id = profile.id
           AND membership.agency_id = p_agency_id
           AND membership.role = profile.role
           AND membership.status = 'active'
          WHERE profile.id::text = NULLIF(current_setting('app.current_user_id', true), '')
            AND profile.is_active = true
            AND profile.role IN ('company_owner', 'care_coordinator')
        )
      $$;
      GRANT USAGE ON SCHEMA public TO mycaresight_app;
      GRANT SELECT ON user_profiles, user_agency_roles, patients TO mycaresight_app;
      GRANT EXECUTE ON FUNCTION visit_financial_manager_can_read(uuid) TO mycaresight_app;
      INSERT INTO agencies VALUES ('${AGENCY}'), ('${OTHER_AGENCY}');
      INSERT INTO user_profiles VALUES
        ('${MANAGER}', 'company_owner', '${AGENCY}', true),
        ('${CAREGIVER}', 'staff_member', '${AGENCY}', true);
      INSERT INTO user_agency_roles VALUES
        ('${MANAGER}', '${AGENCY}', 'company_owner', 'active'),
        ('${CAREGIVER}', '${AGENCY}', 'staff_member', 'active');
      INSERT INTO patients VALUES ('${PATIENT}', '${AGENCY}'), ('${OTHER_PATIENT}', '${OTHER_AGENCY}');
      INSERT INTO patient_skill_requirements (agency_id, patient_id, skill_codes)
      VALUES ('${AGENCY}', '${PATIENT}', ARRAY['Wound Care']);
    `)
    await db.exec(migration)
  }, 60_000)

  afterAll(async () => db.close())

  test('adds preferred skills, forced RLS, manager policies, and least-privilege grants', async () => {
    const results = await db.exec(verification)
    const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(row).toEqual(expect.objectContaining({
      preferred_skills_column_ok: true,
      skill_sets_check_ok: true,
      rls_forced: true,
      manager_select_policy_ok: true,
      manager_insert_policy_ok: true,
      manager_update_policy_ok: true,
      app_can_read: true,
      app_can_insert_skill_sets: true,
      app_can_update_skill_sets: true,
      excess_access_blocked: true,
      overlapping_skill_set_count: 0,
    }))
  })

  test('permits the active same-agency manager and rejects overlap', async () => {
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      await tx.query("SELECT set_config('app.current_user_id',$1,true)", [MANAGER])
      await tx.query(
        `UPDATE patient_skill_requirements
         SET preferred_skill_codes = ARRAY['Spanish'], updated_at = now()
         WHERE patient_id = $1`,
        [PATIENT]
      )
      await expect(tx.query(
        `UPDATE patient_skill_requirements
         SET preferred_skill_codes = ARRAY['Wound Care']
         WHERE patient_id = $1`,
        [PATIENT]
      )).rejects.toMatchObject({ code: '23514' })
    })
  })

  test('fails closed for caregivers and cross-agency records', async () => {
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      await tx.query("SELECT set_config('app.current_user_id',$1,true)", [CAREGIVER])
      expect((await tx.query('SELECT id FROM patient_skill_requirements')).rows).toEqual([])
    })
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      await tx.query("SELECT set_config('app.current_user_id',$1,true)", [MANAGER])
      await expect(tx.query(
        `INSERT INTO patient_skill_requirements
          (agency_id, patient_id, skill_codes, preferred_skill_codes)
         VALUES ($1, $2, '{}', '{}')`,
        [OTHER_AGENCY, OTHER_PATIENT]
      )).rejects.toMatchObject({ code: '42501' })
    })
  })
})
