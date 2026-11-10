/** @jest-environment node */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')

describe('production-safe reference-data migration 042', () => {
  let db: PGlite
  const migration = read('042-production-reference-data.sql')
  const verifier = read('042-verify-production-reference-data.sql')

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE capability_catalog(
        key text PRIMARY KEY,label text NOT NULL,description text NOT NULL,sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE task_categories(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,service_type text NOT NULL,
        display_order integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE task_catalog(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name text NOT NULL,description text,
        category_id uuid NOT NULL REFERENCES task_categories(id),is_skilled boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,display_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE configuration_types(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name text NOT NULL,description text,
        supports_hierarchy boolean NOT NULL DEFAULT false,is_admin_manageable boolean NOT NULL DEFAULT true,
        is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE configuration_values(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type_id uuid NOT NULL REFERENCES configuration_types(id),
        parent_id uuid REFERENCES configuration_values(id),code text,name text NOT NULL,description text,
        is_active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 0,created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE credential_catalog(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name text NOT NULL,
        credential_type text NOT NULL,service_type text,is_active boolean NOT NULL DEFAULT true,
        display_order integer NOT NULL DEFAULT 0,scope text NOT NULL DEFAULT 'system',agency_id uuid,
        category_id uuid REFERENCES configuration_values(id),created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE billing_codes(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name text NOT NULL,unit_type text NOT NULL,
        rate numeric(10,2),is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE validation_rules(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,description text,field_key text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE audit_log(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,table_name text NOT NULL,record_id uuid,
        action text NOT NULL,performed_by_user_id uuid,details jsonb,created_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT USAGE ON SCHEMA public TO mycaresight_app;
      GRANT SELECT ON capability_catalog,task_categories,task_catalog,configuration_types,
        configuration_values,credential_catalog,billing_codes,validation_rules TO mycaresight_app;
      BEGIN;
      ${migration}
      COMMIT;
    `)
  }, 60_000)

  afterAll(async () => db.close())

  test('loads only the approved catalogs and passes the verifier', async () => {
    const results = await db.exec(verifier)
    const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(Object.values(row).every(Boolean)).toBe(true)
    const excluded = await db.query<{ license_types: string | null; pricing: string | null }>(`
      SELECT to_regclass('public.license_types')::text AS license_types,
        to_regclass('public.pricing')::text AS pricing
    `)
    expect(excluded.rows[0]).toEqual({ license_types: null, pricing: null })
  })

  test('is repeatable without adding a second audit event', async () => {
    await db.exec(`BEGIN; ${migration} COMMIT;`)
    const audit = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_log WHERE action='SEED_REFERENCE_DATA'"
    )
    expect(audit.rows[0]?.count).toBe(1)
  })

  test('normalizes only the reviewed legacy bilingual-label encoding', async () => {
    await db.exec(`
      UPDATE task_catalog
      SET name = 'Bilingual ' || chr(226) || chr(8364) || chr(8221) || ' Mandarin'
      WHERE code = 'task_cg_bilingual_mandarin';
      BEGIN;
      ${migration}
      COMMIT;
    `)
    const corrected = await db.query<{ name: string }>(
      "SELECT name FROM task_catalog WHERE code = 'task_cg_bilingual_mandarin'"
    )
    expect(corrected.rows[0]?.name).toBe(`Bilingual ${String.fromCodePoint(8212)} Mandarin`)
  })

  test('rejects conflicting canonical rows without changing data', async () => {
    const original = await db.query<{ name: string }>(
      'SELECT name FROM task_catalog ORDER BY code LIMIT 1'
    )
    await db.exec("UPDATE task_catalog SET name='Drifted' WHERE code=(SELECT min(code) FROM task_catalog)")
    await expect(db.exec(`BEGIN; ${migration} COMMIT;`)).rejects.toThrow(/conflicting canonical row/)
    await db.exec('ROLLBACK')
    const drifted = await db.query<{ name: string }>(
      'SELECT name FROM task_catalog ORDER BY code LIMIT 1'
    )
    expect(drifted.rows[0]?.name).toBe('Drifted')
    expect(drifted.rows[0]?.name).not.toBe(original.rows[0]?.name)
  })

  test('contains no tenant, pricing, license-type, or task-link writes', () => {
    expect(migration).not.toContain('public.license_types')
    expect(migration).not.toContain('public.pricing')
    expect(migration).not.toContain('public.task_required_credentials')
    expect(migration).not.toMatch(/INSERT INTO public\.(agencies|user_profiles|patients|caregiver_members|scheduled_visits)/)
  })
})
