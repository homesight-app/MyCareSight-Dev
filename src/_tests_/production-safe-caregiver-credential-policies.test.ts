/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('production-safe caregiver credential policies', () => {
  const migration = read(
    'scripts/migrations/041-production-safe-caregiver-credential-policies.sql'
  )
  const verifier = read(
    'scripts/migrations/041-verify-production-safe-caregiver-credential-policies.sql'
  )

  test('changes policy state without approving or rewriting caregiver skill data', () => {
    expect(migration).not.toMatch(/\bUPDATE\s+public\.caregiver_skill_assignments\b/i)
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+public\.caregiver_skill_assignments\b/i)
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.caregiver_skill_assignments\b/i)
    expect(migration).not.toContain('migration_040_auto_verify_pending_skills')
    expect(migration).not.toContain('audit_log')
  })

  test('converges both legacy and migration 040 policy names', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS caregiver_skill_assignments_insert')
    expect(migration).toContain('DROP POLICY IF EXISTS caregiver_skill_assignments_manager_insert')
    expect(migration).toContain('DROP POLICY IF EXISTS caregiver_credentials_insert_own_staff')
    expect(migration).toContain('DROP POLICY IF EXISTS caregiver_credentials_manager_insert')
  })

  test('retains caregiver self-read and limits writes to authorized managers', () => {
    expect(migration).toContain('caregiver_skill_assignments_select')
    expect(migration).toContain('caregiver_credentials_select')
    expect(migration).toContain('public.skill_actor_is_caregiver(agency_id, caregiver_member_id)')
    expect(migration).toContain('caregiver_skill_assignments_manager_insert')
    expect(migration).toContain('caregiver_credentials_manager_insert')
    expect(verifier).toContain('caregiver_has_no_skill_write_policy')
    expect(verifier).toContain('caregiver_has_no_credential_write_policy')
  })

  test('enforces tenant and active-catalog integrity on skill inserts and updates', () => {
    const insertPolicy = migration
      .split('CREATE POLICY caregiver_skill_assignments_manager_insert')[1]
      .split('CREATE POLICY caregiver_skill_assignments_manager_update')[0]
    const updatePolicy = migration
      .split('CREATE POLICY caregiver_skill_assignments_manager_update')[1]
      .split('CREATE POLICY caregiver_skill_assignments_manager_delete')[0]

    for (const policy of [insertPolicy, updatePolicy]) {
      expect(policy).toContain('caregiver.agency_id = caregiver_skill_assignments.agency_id')
      expect(policy).toContain("catalog.credential_type = 'skill'")
      expect(policy).toContain('catalog.is_active = true')
      expect(policy).toContain("verification_status = 'verified'")
    }
  })

  test('applies cleanly and preserves pending skill rows', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
        CREATE TABLE public.caregiver_members (id uuid PRIMARY KEY, agency_id uuid NOT NULL);
        CREATE TABLE public.credential_catalog (
          id uuid PRIMARY KEY,
          agency_id uuid,
          credential_type text NOT NULL,
          scope text NOT NULL,
          is_active boolean NOT NULL
        );
        CREATE TABLE public.caregiver_skill_assignments (
          id uuid PRIMARY KEY,
          agency_id uuid NOT NULL,
          caregiver_member_id uuid NOT NULL,
          credential_id uuid NOT NULL,
          verification_status text NOT NULL,
          verified_at timestamptz
        );
        CREATE TABLE public.caregiver_credentials (
          id uuid PRIMARY KEY,
          agency_id uuid NOT NULL,
          caregiver_member_id uuid NOT NULL
        );
        CREATE FUNCTION public.skill_actor_is_platform_admin() RETURNS boolean
          LANGUAGE sql STABLE AS 'SELECT false';
        CREATE FUNCTION public.skill_actor_can_manage_agency(uuid) RETURNS boolean
          LANGUAGE sql STABLE AS 'SELECT false';
        CREATE FUNCTION public.skill_actor_is_caregiver(uuid, uuid) RETURNS boolean
          LANGUAGE sql STABLE AS 'SELECT false';
        INSERT INTO public.caregiver_members VALUES
          ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
        INSERT INTO public.credential_catalog VALUES
          ('30000000-0000-4000-8000-000000000001', NULL, 'skill', 'system', true);
        INSERT INTO public.caregiver_skill_assignments VALUES (
          '40000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          'self_reported',
          NULL
        );
        BEGIN;
        ${migration}
        COMMIT;
      `)

      const verificationResults = await db.exec(verifier)
      const verificationRow = verificationResults.flatMap((result) => result.rows)[0] as Record<
        string,
        unknown
      >
      expect(Object.values(verificationRow).every((value) => value === true)).toBe(true)

      const dataResults = await db.query<{ verification_status: string; verified_at: Date | null }>(`
        SELECT verification_status, verified_at
        FROM public.caregiver_skill_assignments
        WHERE id = '40000000-0000-4000-8000-000000000001'
      `)
      expect(dataResults.rows).toEqual([
        { verification_status: 'self_reported', verified_at: null },
      ])
    } finally {
      await db.close()
    }
  })
})
