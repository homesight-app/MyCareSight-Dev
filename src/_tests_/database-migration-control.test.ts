/** @jest-environment node */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('database migration control', () => {
  test('validates the immutable legacy inventory and managed migration checksums', () => {
    const output = execFileSync(
      process.execPath,
      [join(root, 'scripts/database-migrations/cli.mjs'), 'validate'],
      { cwd: root, encoding: 'utf8' }
    )

    expect(output).toMatch(/Migration control valid: 43 legacy files, 3 managed migration/)
  })

  test('keeps the ledger append-only and unavailable to runtime roles', () => {
    const migration = read('scripts/migrations/038-database-migration-ledger.sql')
    const verifier = read('scripts/migrations/038-verify-database-migration-ledger.sql')

    expect(migration).toContain('CREATE TABLE public.schema_migrations')
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.schema_migrations')
    expect(migration).toContain('REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC')
    expect(migration).toContain('applied_by text NOT NULL DEFAULT session_user')
    expect(migration).toContain('executed_as text NOT NULL DEFAULT current_user')
    expect(migration).toContain("rolname = 'mycaresight_app'")
    expect(migration).toContain("rolname = 'mycaresight_jobs'")
    expect(verifier).toContain('append_only_trigger_exists')
    expect(verifier).toContain('runtime_roles_have_no_grants')
  })

  test('registers session-revocation hardening as an immutable managed migration', () => {
    const migration = read('scripts/migrations/039-scope-membership-session-revocation.sql')
    const verifier = read('scripts/migrations/039-verify-scope-membership-session-revocation.sql')
    const rollback = read('scripts/database-rollbacks/039-rollback-scope-membership-session-revocation.sql')

    expect(migration).toContain('UPDATE OF user_id, agency_id, status')
    expect(migration).toContain('WHERE user_agency_roles.status IS DISTINCT FROM EXCLUDED.status')
    expect(migration).toContain('NEW.status IS NOT DISTINCT FROM OLD.status')
    expect(verifier).toContain('source_triggers_are_scoped')
    expect(verifier).toContain('revocation_function_skips_noop')
    expect(rollback).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.caregiver_members')
  })

  test('keeps the ownership bootstrap least-privilege and extension-safe', () => {
    const bootstrap = read('scripts/database-bootstrap/001-schema-owner-bootstrap.sql')
    const verifier = read('scripts/database-bootstrap/001-verify-schema-owner-bootstrap.sql')
    const rollback = read('scripts/database-bootstrap/001-rollback-schema-owner-bootstrap.sql')

    expect(bootstrap).toContain("session_user <> 'neondb_owner'")
    expect(bootstrap).toContain("pg_has_role('mycaresight_migrator','neon_superuser','MEMBER')")
    expect(bootstrap).toContain("d.deptype='e'")
    expect(bootstrap).toContain("linked.deptype IN ('a','i')")
    expect(bootstrap).not.toContain('ALTER DATABASE')
    expect(bootstrap).not.toContain('ALTER SCHEMA public OWNER')
    expect(verifier).toContain('no_untransferred_application_objects')
    expect(verifier).toContain('app_not_owner_member')
    expect(verifier).toContain('jobs_not_owner_member')
    expect(rollback).not.toContain('REASSIGN OWNED')
    expect(rollback).not.toContain('DROP ROLE')
    expect(rollback).toContain("linked.deptype IN ('a','i')")
    expect(rollback).toContain('OWNER TO neondb_owner')
  })

  test('creates a verified ledger that rejects mutation', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
        CREATE ROLE mycaresight_jobs LOGIN NOSUPERUSER NOBYPASSRLS;
        BEGIN;
        ${read('scripts/migrations/038-database-migration-ledger.sql')}
        INSERT INTO public.schema_migrations(
          migration_id, file_name, checksum_sha256, target_environment
        ) VALUES (
          '038', '038-database-migration-ledger.sql', repeat('a', 64), 'development'
        );
        COMMIT;
      `)

      const results = await db.exec(
        read('scripts/migrations/038-verify-database-migration-ledger.sql')
      )
      const row = results.flatMap((result) => result.rows)[0] as Record<string, unknown>
      expect(Object.values(row).every(Boolean)).toBe(true)
      await expect(
        db.exec("UPDATE public.schema_migrations SET execution_ms=1 WHERE migration_id='038'")
      ).rejects.toThrow(/append-only/)
    } finally {
      await db.close()
    }
  })

  test('does not expose a database apply command before baseline approval', () => {
    const cli = read('scripts/database-migrations/cli.mjs')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }

    expect(cli).toContain('<validate|status>')
    expect(cli).not.toMatch(/command === ['"]apply['"]/)
    expect(packageJson.scripts['db:migrations:validate']).toBeDefined()
    expect(packageJson.scripts['db:migrations:status']).toBeDefined()
    expect(packageJson.scripts['db:migrations:apply']).toBeUndefined()
  })
})
