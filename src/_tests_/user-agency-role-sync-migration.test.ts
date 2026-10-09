/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/019-user-agency-role-sync.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/019-verify-user-agency-role-sync.sql'),
  'utf8'
)

const USER_ID = '70000000-0000-4000-8000-000000000001'
const AGENCY_ID = '70000000-0000-4000-8000-000000000002'
const OTHER_AGENCY_ID = '70000000-0000-4000-8000-000000000003'

describe('user agency role synchronization migration 019', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE agencies (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY,
        role text NOT NULL,
        agency_id uuid,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE agency_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        agency_id uuid,
        status text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE care_coordinators (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        agency_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE caregiver_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        agency_id uuid,
        status text NOT NULL DEFAULT 'active',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE user_agency_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        agency_id uuid NOT NULL,
        role text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agency_id uuid,
        table_name text NOT NULL,
        record_id uuid,
        action text NOT NULL,
        performed_by_user_id uuid,
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT USAGE ON SCHEMA public TO mycaresight_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON
        agency_admins, care_coordinators, caregiver_members, user_agency_roles
        TO mycaresight_app;
      INSERT INTO agencies (id, name) VALUES
        ('${AGENCY_ID}', 'Synthetic Agency'),
        ('${OTHER_AGENCY_ID}', 'Other Synthetic Agency');
      INSERT INTO user_profiles (id, role, agency_id)
      VALUES ('${USER_ID}', 'company_owner', '${AGENCY_ID}');
      INSERT INTO agency_admins (user_id, agency_id, status)
      VALUES ('${USER_ID}', '${AGENCY_ID}', 'active');
    `)
    await db.exec(migration)
  }, 60_000)

  afterAll(async () => db.close())

  test('backfills, synchronizes lifecycle changes, and closes direct runtime writes', async () => {
    const verifyResults = await db.exec(verification)
    const verifyRow = verifyResults.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(verifyRow).toEqual(expect.objectContaining({
      agency_admin_trigger_ok: true,
      coordinator_trigger_ok: true,
      caregiver_trigger_ok: true,
      profile_trigger_ok: true,
      duplicate_count: 0,
      missing_or_stale_count: 0,
      unique_key_ok: true,
      foreign_keys_ok: true,
      checks_ok: true,
      app_can_read: true,
      app_direct_writes_blocked: true,
      public_table_access_blocked: true,
      jobs_access_blocked: true,
      public_execute_blocked: true,
    }))

    await db.exec(`
      SET ROLE mycaresight_app;
      UPDATE agency_admins SET status = 'inactive' WHERE user_id = '${USER_ID}';
      RESET ROLE;
    `)
    expect((await db.query<{ status: string }>(`
      SELECT status FROM user_agency_roles
      WHERE user_id = '${USER_ID}' AND role = 'company_owner'
    `)).rows[0]?.status).toBe('inactive')

    await db.exec(`
      UPDATE user_profiles
      SET role = 'staff_member', agency_id = '${AGENCY_ID}'
      WHERE id = '${USER_ID}';
      INSERT INTO caregiver_members (user_id, agency_id, status)
      VALUES ('${USER_ID}', '${AGENCY_ID}', 'active');
    `)
    const transitioned = await db.query<{ role: string; status: string }>(`
      SELECT role, status FROM user_agency_roles WHERE user_id = '${USER_ID}'
    `)
    expect(transitioned.rows).toEqual([{ role: 'staff_member', status: 'active' }])

    await db.exec(`
      UPDATE user_profiles SET agency_id = '${OTHER_AGENCY_ID}' WHERE id = '${USER_ID}';
      UPDATE caregiver_members SET agency_id = '${OTHER_AGENCY_ID}' WHERE user_id = '${USER_ID}';
    `)
    const moved = await db.query<{ agency_id: string }>(`
      SELECT agency_id FROM user_agency_roles WHERE user_id = '${USER_ID}'
    `)
    expect(moved.rows).toEqual([{ agency_id: OTHER_AGENCY_ID }])

    await db.exec(`DELETE FROM caregiver_members WHERE user_id = '${USER_ID}'`)
    expect((await db.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM user_agency_roles WHERE user_id = '${USER_ID}'
    `)).rows[0]?.count).toBe(0)

    await db.exec('SET ROLE mycaresight_app')
    try {
      await expect(db.exec(`
        INSERT INTO user_agency_roles (user_id, agency_id, role, status)
        VALUES ('${USER_ID}', '${AGENCY_ID}', 'staff_member', 'active')
      `)).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('RESET ROLE')
    }
  })
})
