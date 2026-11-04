/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import {
  reportSessionVerificationFailure,
  SessionVerificationUnavailableError,
} from '@/lib/auth/session-diagnostics'

const readMigration = (name: string) => readFileSync(
  join(process.cwd(), 'scripts/migrations', name),
  'utf8'
)

const authMigration = readMigration('015-auth-session-foundation.sql')
const roleMigration = readMigration('019-user-agency-role-sync.sql')
const hardeningMigration = readMigration('039-scope-membership-session-revocation.sql')
const verification = readMigration('039-verify-scope-membership-session-revocation.sql')

const AGENCY = '39000000-0000-4000-8000-000000000001'
const ADMIN = '39000000-0000-4000-8000-000000000002'
const COORDINATOR = '39000000-0000-4000-8000-000000000003'
const CAREGIVER = '39000000-0000-4000-8000-000000000004'

describe('membership session-revocation hardening migration 039', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE agencies (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY,
        email text NOT NULL,
        role text NOT NULL,
        agency_id uuid,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE agency_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        agency_id uuid,
        status text,
        contact_name text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE care_coordinators (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        agency_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active',
        first_name text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE caregiver_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        agency_id uuid,
        status text NOT NULL DEFAULT 'active',
        email text,
        address text,
        skills text[] NOT NULL DEFAULT '{}',
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
        patient_id uuid,
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
    `)
    await db.exec(authMigration)
    await db.exec(`
      INSERT INTO agencies (id, name) VALUES ('${AGENCY}', 'Synthetic Agency');
      INSERT INTO user_profiles (id, email, role, agency_id, password_hash) VALUES
        ('${ADMIN}', 'owner@example.invalid', 'company_owner', '${AGENCY}', 'hash'),
        ('${COORDINATOR}', 'coordinator@example.invalid', 'care_coordinator', '${AGENCY}', 'hash'),
        ('${CAREGIVER}', 'caregiver@example.invalid', 'staff_member', '${AGENCY}', 'hash');
      INSERT INTO agency_admins (user_id, agency_id, status, contact_name)
      VALUES ('${ADMIN}', '${AGENCY}', 'active', 'Synthetic Owner');
      INSERT INTO care_coordinators (user_id, agency_id, status, first_name)
      VALUES ('${COORDINATOR}', '${AGENCY}', 'active', 'Synthetic');
      INSERT INTO caregiver_members (user_id, agency_id, status, email)
      VALUES ('${CAREGIVER}', '${AGENCY}', 'active', 'caregiver@example.invalid');
    `)
    await db.exec(roleMigration)
    await db.exec(`BEGIN; ${hardeningMigration} COMMIT;`)
  }, 60_000)

  afterAll(async () => db.close())

  async function addSession(userId: string, character: string) {
    await db.exec(`
      INSERT INTO auth_sessions (user_id, token_hash, expires_at)
      VALUES ('${userId}', repeat('${character}', 64), now() + interval '1 hour')
    `)
  }

  async function sessionState(userId: string) {
    return (await db.query<{ revoked: boolean; reason: string | null }>(`
      SELECT revoked_at IS NOT NULL AS revoked, revoke_reason AS reason
      FROM auth_sessions
      WHERE user_id = '${userId}'
      ORDER BY created_at DESC
      LIMIT 1
    `)).rows[0]
  }

  test('verifier confirms scoped triggers, no-op guards, and public denial', async () => {
    const results = await db.exec(verification)
    const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(Object.values(row).every(Boolean)).toBe(true)
  })

  test('ordinary administrator, coordinator, and caregiver edits preserve sessions', async () => {
    await addSession(ADMIN, 'a')
    await addSession(COORDINATOR, 'b')
    await addSession(CAREGIVER, 'c')

    await db.exec(`
      SET ROLE mycaresight_app;
      UPDATE agency_admins SET contact_name = 'Updated Owner', updated_at = now()
      WHERE user_id = '${ADMIN}';
      UPDATE care_coordinators SET first_name = 'Updated', updated_at = now()
      WHERE user_id = '${COORDINATOR}';
      UPDATE caregiver_members
      SET skills = ARRAY['Synthetic Skill'], address = 'Synthetic Address', updated_at = now()
      WHERE user_id = '${CAREGIVER}';
      RESET ROLE;
    `)

    expect(await sessionState(ADMIN)).toEqual({ revoked: false, reason: null })
    expect(await sessionState(COORDINATOR)).toEqual({ revoked: false, reason: null })
    expect(await sessionState(CAREGIVER)).toEqual({ revoked: false, reason: null })
  })

  test('no-op source and membership updates preserve sessions', async () => {
    await db.exec(`
      SET ROLE mycaresight_app;
      UPDATE caregiver_members SET status = status WHERE user_id = '${CAREGIVER}';
      RESET ROLE;
      UPDATE user_agency_roles SET status = status WHERE user_id = '${CAREGIVER}';
    `)

    expect(await sessionState(CAREGIVER)).toEqual({ revoked: false, reason: null })
  })

  test('a real membership status change still revokes the affected session', async () => {
    await db.exec(`
      SET ROLE mycaresight_app;
      UPDATE caregiver_members SET status = 'inactive' WHERE user_id = '${CAREGIVER}';
      RESET ROLE;
    `)

    expect(await sessionState(CAREGIVER)).toEqual({
      revoked: true,
      reason: 'membership_changed',
    })
  })

  test('a security-sensitive profile change still revokes the affected session', async () => {
    await db.exec(`UPDATE user_profiles SET email = 'owner-updated@example.invalid' WHERE id = '${ADMIN}'`)
    expect(await sessionState(ADMIN)).toEqual({
      revoked: true,
      reason: 'identity_changed',
    })
  })
})

describe('session verification diagnostics', () => {
  test('logs only the stable failure category and exposes a generic error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      reportSessionVerificationFailure('opaque-session')
      reportSessionVerificationFailure('current-identity')
      expect(errorSpy.mock.calls).toEqual([
        ['[auth] Session datastore verification failed (opaque-session)'],
        ['[auth] Session datastore verification failed (current-identity)'],
      ])
      expect(new SessionVerificationUnavailableError()).toMatchObject({
        name: 'SessionVerificationUnavailableError',
        message: 'Session verification is temporarily unavailable',
      })
    } finally {
      errorSpy.mockRestore()
    }
  })
})

