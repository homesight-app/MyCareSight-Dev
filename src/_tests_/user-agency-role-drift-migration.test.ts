/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration019 = readFileSync(
  join(process.cwd(), 'scripts/migrations/019-user-agency-role-sync.sql'),
  'utf8'
)
const migration021 = readFileSync(
  join(process.cwd(), 'scripts/migrations/021-reconcile-user-agency-role-drift.sql'),
  'utf8'
)
const verification021 = readFileSync(
  join(process.cwd(), 'scripts/migrations/021-verify-user-agency-role-drift.sql'),
  'utf8'
)

const USER_ID = '71000000-0000-4000-8000-000000000001'
const AGENCY_ID = '71000000-0000-4000-8000-000000000002'

describe('user agency role drift migration 021', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE mycaresight_jobs LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE agencies (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY, role text NOT NULL, agency_id uuid,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE agency_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, agency_id uuid,
        status text, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE care_coordinators (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, agency_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active', updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE caregiver_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, agency_id uuid,
        status text NOT NULL DEFAULT 'active', updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE user_agency_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, agency_id uuid NOT NULL,
        role text NOT NULL, status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid, table_name text NOT NULL,
        record_id uuid, action text NOT NULL, performed_by_user_id uuid, details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT USAGE ON SCHEMA public TO mycaresight_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON
        agency_admins, care_coordinators, caregiver_members, user_agency_roles
        TO mycaresight_app;
      INSERT INTO agencies (id, name) VALUES ('${AGENCY_ID}', 'Synthetic Agency');
      INSERT INTO user_profiles (id, role, agency_id)
      VALUES ('${USER_ID}', 'company_owner', '${AGENCY_ID}');
      INSERT INTO agency_admins (user_id, agency_id, status)
      VALUES ('${USER_ID}', '${AGENCY_ID}', 'pending');
      INSERT INTO caregiver_members (user_id, agency_id, status)
      VALUES ('${USER_ID}', '${AGENCY_ID}', 'active');
      INSERT INTO user_agency_roles (user_id, agency_id, role, status)
      VALUES ('${USER_ID}', '${AGENCY_ID}', 'staff_member', 'active');
    `)
    await db.exec(migration019)
    await db.exec(migration021)
  }, 60_000)

  afterAll(async () => db.close())

  test('removes stale roles while preserving the authoritative pending membership', async () => {
    const verification = await db.exec(verification021)
    const row = verification.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(row).toEqual(expect.objectContaining({
      missing_or_stale_count: 0,
      unexpected_membership_count: 0,
      profile_cleanup_trigger_ok: true,
      public_execute_blocked: true,
    }))

    const memberships = await db.query<{ role: string; status: string }>(`
      SELECT role, status FROM user_agency_roles WHERE user_id = '${USER_ID}'
    `)
    expect(memberships.rows).toEqual([{ role: 'company_owner', status: 'pending' }])
  })

  test('removes every obsolete membership on a later profile role change', async () => {
    await db.exec(`
      UPDATE user_profiles SET role = 'care_coordinator' WHERE id = '${USER_ID}';
    `)
    expect((await db.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM user_agency_roles WHERE user_id = '${USER_ID}'
    `)).rows[0]?.count).toBe(0)

    await db.exec(`
      INSERT INTO care_coordinators (user_id, agency_id, status)
      VALUES ('${USER_ID}', '${AGENCY_ID}', 'active');
    `)
    expect((await db.query<{ role: string; status: string }>(`
      SELECT role, status FROM user_agency_roles WHERE user_id = '${USER_ID}'
    `)).rows).toEqual([{ role: 'care_coordinator', status: 'active' }])
  })
})
