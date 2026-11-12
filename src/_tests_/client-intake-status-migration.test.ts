/** @jest-environment node */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')

describe('client intake status migration 044', () => {
  let db: PGlite
  const migration = read('044-client-intake-status.sql')
  const verifier = read('044-verify-client-intake-status.sql')

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE patients(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        status text NOT NULL DEFAULT 'active',
        CONSTRAINT small_clients_status_check CHECK (status IN ('active', 'inactive'))
      );
      INSERT INTO patients(status) VALUES ('active'), ('inactive');
      BEGIN;
      ${migration}
      COMMIT;
    `)
  })

  afterAll(async () => db.close())

  test('allows pending intake while preserving the existing lifecycle values', async () => {
    await db.exec("INSERT INTO patients(status) VALUES ('pending')")
    const results = await db.exec(verifier)
    const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(Object.values(row).every(Boolean)).toBe(true)
  })

  test('rejects unsupported statuses', async () => {
    await expect(db.exec("INSERT INTO patients(status) VALUES ('unknown')")).rejects.toThrow()
  })

  test('adds the lifecycle constraint when the existing column has only NOT NULL', async () => {
    const unconstrained = new PGlite()
    try {
      await unconstrained.exec(`
        CREATE TABLE patients(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          status text NOT NULL DEFAULT 'active'
        );
        INSERT INTO patients(status) VALUES ('active');
        BEGIN;
        ${migration}
        COMMIT;
      `)
      const results = await unconstrained.exec(verifier)
      const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
      expect(Object.values(row).every(Boolean)).toBe(true)
      await expect(unconstrained.exec("INSERT INTO patients(status) VALUES ('unknown')")).rejects.toThrow()
    } finally {
      await unconstrained.close()
    }
  })

  test('fails closed when an unrecognized status constraint exists', async () => {
    const unexpected = new PGlite()
    try {
      await unexpected.exec(`
        CREATE TABLE patients(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          status text NOT NULL DEFAULT 'active',
          CONSTRAINT unexpected_status_check CHECK (status IN ('active', 'archived'))
        );
        INSERT INTO patients(status) VALUES ('active');
        BEGIN;
      `)
      await expect(unexpected.exec(migration)).rejects.toThrow(/unrecognized patients\.status constraint/)
      await unexpected.exec('ROLLBACK;')
    } finally {
      await unexpected.close()
    }
  })
})
