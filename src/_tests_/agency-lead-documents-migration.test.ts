/** @jest-environment node */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')

describe('agency lead documents migration 043', () => {
  let db: PGlite
  const migration = read('043-agency-lead-documents.sql')
  const verifier = read('043-verify-agency-lead-documents.sql')

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE leads(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agency_id uuid,
        converted_client_id uuid
      );
      CREATE TABLE lead_documents(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id uuid NOT NULL REFERENCES leads(id),
        document_name text NOT NULL,
        file_url text NOT NULL
      );
      CREATE FUNCTION plan_actor_is_platform_staff() RETURNS boolean
        LANGUAGE sql STABLE AS 'SELECT false';
      CREATE FUNCTION skill_actor_can_manage_agency(uuid) RETURNS boolean
        LANGUAGE sql STABLE AS 'SELECT false';
      BEGIN;
      ${migration}
      COMMIT;
    `)
  })

  afterAll(async () => db.close())

  test('forces tenant-scoped RLS and least-privilege runtime grants', async () => {
    const results = await db.exec(verifier)
    const row = results.flatMap((result) => result.rows)[0] as Record<string, unknown>
    expect(Object.values(row).every(Boolean)).toBe(true)
  })

  test('is repeatable', async () => {
    await db.exec(`BEGIN; ${migration} COMMIT;`)
    const results = await db.exec(verifier)
    const row = results.flatMap((result) => result.rows)[0] as Record<string, unknown>
    expect(Object.values(row).every(Boolean)).toBe(true)
  })

  test('does not grant update access to lead document metadata', () => {
    expect(migration).toContain('GRANT SELECT, INSERT, DELETE')
    expect(migration).toContain('REVOKE UPDATE')
    expect(migration).not.toMatch(/GRANT[^;]*UPDATE[^;]*lead_documents/i)
  })
})
