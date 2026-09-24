/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/015-auth-session-foundation.sql'),
  'utf8'
)
const roleRepair = readFileSync(
  join(process.cwd(), 'scripts/migrations/015a-reconcile-caregiver-profile-role.sql'),
  'utf8'
)

describe('auth session migration 015', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY,
        email text NOT NULL,
        role text NOT NULL,
        agency_id uuid,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE user_agency_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES user_profiles(id),
        agency_id uuid NOT NULL,
        role text NOT NULL,
        status text NOT NULL DEFAULT 'active'
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
      CREATE TABLE caregiver_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        agency_id uuid NOT NULL,
        email text NOT NULL
      );
      CREATE TABLE agency_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        company_owner_id uuid,
        agency_id uuid NOT NULL,
        contact_email text NOT NULL
      );
    `)
    await db.exec(migration)
  }, 60_000)

  afterAll(async () => db.close())

  it('creates provider-neutral auth tables with public access revoked', async () => {
    const result = await db.query<{
      sessions: string | null
      resets: string | null
      limits: string | null
      runtime_select: boolean
      public_select: boolean
    }>(`
      SELECT
        to_regclass('public.auth_sessions')::text AS sessions,
        to_regclass('public.password_reset_tokens')::text AS resets,
        to_regclass('public.auth_rate_limit_events')::text AS limits,
        has_table_privilege('mycaresight_app', 'public.auth_sessions', 'SELECT') AS runtime_select,
        has_table_privilege('public', 'public.auth_sessions', 'SELECT') AS public_select
    `)

    expect(result.rows[0]).toEqual({
      sessions: 'auth_sessions',
      resets: 'password_reset_tokens',
      limits: 'auth_rate_limit_events',
      runtime_select: true,
      public_select: false,
    })
  })

  it('revokes sessions after a security-sensitive profile change', async () => {
    const userId = '10000000-0000-4000-8000-000000000001'
    await db.exec(`
      INSERT INTO user_profiles (id, email, role, password_hash)
      VALUES ('${userId}', 'synthetic@example.invalid', 'admin', 'old');
      INSERT INTO auth_sessions (user_id, token_hash, expires_at)
      VALUES ('${userId}', repeat('a', 64), now() + interval '1 hour');
      UPDATE user_profiles SET password_hash = 'new' WHERE id = '${userId}';
    `)

    const sessions = await db.query<{ revoked: boolean; revoke_reason: string }>(`
      SELECT revoked_at IS NOT NULL AS revoked, revoke_reason
      FROM auth_sessions WHERE user_id = '${userId}'
    `)
    const audits = await db.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM audit_log
      WHERE table_name = 'auth_sessions' AND record_id = '${userId}' AND action = 'REVOKE'
    `)

    expect(sessions.rows[0]).toEqual({ revoked: true, revoke_reason: 'identity_changed' })
    expect(audits.rows[0]?.count).toBe(1)
  })

  it('reconciles only the unambiguous caregiver role mismatch', async () => {
    const userId = '10000000-0000-4000-8000-000000000002'
    const agencyId = '20000000-0000-4000-8000-000000000002'
    await db.exec(`
      INSERT INTO user_profiles (id, email, role, agency_id, password_hash)
      VALUES ('${userId}', 'caregiver@example.invalid', 'company_owner', '${agencyId}', 'hash');
      INSERT INTO user_agency_roles (user_id, agency_id, role, status)
      VALUES ('${userId}', '${agencyId}', 'staff_member', 'active');
      INSERT INTO caregiver_members (user_id, agency_id, email)
      VALUES ('${userId}', '${agencyId}', 'caregiver@example.invalid');
    `)

    await db.exec(roleRepair)

    const profile = await db.query<{ role: string }>(`
      SELECT role FROM user_profiles WHERE id = '${userId}'
    `)
    const audits = await db.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM audit_log
      WHERE record_id = '${userId}' AND action = 'RECONCILE_ROLE'
    `)
    expect(profile.rows[0]?.role).toBe('staff_member')
    expect(audits.rows[0]?.count).toBe(1)
  })
})
