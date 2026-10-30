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

    expect(output).toMatch(/Migration control valid: 43 legacy files, 1 managed migration/)
  })

  test('keeps the ledger append-only and unavailable to runtime roles', () => {
    const migration = read('scripts/migrations/038-database-migration-ledger.sql')
    const verifier = read('scripts/migrations/038-verify-database-migration-ledger.sql')

    expect(migration).toContain('CREATE TABLE public.schema_migrations')
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.schema_migrations')
    expect(migration).toContain('REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC')
    expect(migration).toContain("rolname = 'mycaresight_app'")
    expect(migration).toContain("rolname = 'mycaresight_jobs'")
    expect(verifier).toContain('append_only_trigger_exists')
    expect(verifier).toContain('runtime_roles_have_no_grants')
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
