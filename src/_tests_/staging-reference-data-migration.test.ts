/** @jest-environment node */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')

describe('staging reference-data migration 037', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
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
      CREATE TABLE task_required_credentials(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES task_catalog(id),
        credential_id uuid NOT NULL REFERENCES credential_catalog(id),requirement_type text NOT NULL DEFAULT 'required',
        notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(task_id,credential_id)
      );
      CREATE TABLE license_types(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),state text NOT NULL,name text NOT NULL,description text NOT NULL,
        cost_min numeric,cost_max numeric,cost_display text NOT NULL,processing_time_min integer,
        processing_time_max integer,processing_time_display text NOT NULL,renewal_period_years integer NOT NULL,
        renewal_period_display text NOT NULL,icon_type text NOT NULL,requirements jsonb DEFAULT '[]'::jsonb,
        is_active boolean DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        service_fee numeric DEFAULT 0,service_fee_display text,certification_category text NOT NULL DEFAULT 'state_license'
      );
      CREATE TABLE pricing(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_admin_license numeric NOT NULL,staff_license numeric NOT NULL,
        created_at timestamptz DEFAULT now(),effective_date date NOT NULL DEFAULT current_date
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
      GRANT SELECT ON task_categories,task_catalog,configuration_types,configuration_values,
        credential_catalog,license_types,pricing,billing_codes,validation_rules TO mycaresight_app;
    `)
    await db.exec(read('037-staging-reference-data.sql'))
  }, 60_000)

  afterAll(async () => db.close())

  test('loads the reviewed catalogs and passes the verifier', async () => {
    const results = await db.exec(read('037-verify-staging-reference-data.sql'))
    const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(Object.values(row).every(Boolean)).toBe(true)
  })

  test('is repeatable without adding a second audit event', async () => {
    await db.exec(read('037-staging-reference-data.sql'))
    const audit = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_log WHERE action='SEED_REFERENCE_DATA'"
    )
    expect(audit.rows[0]?.count).toBe(1)
  })

  test('rejects a non-empty catalog that has drifted', async () => {
    await db.exec("UPDATE task_catalog SET name='Drifted' WHERE code=(SELECT min(code) FROM task_catalog)")
    await expect(db.exec(read('037-staging-reference-data.sql'))).rejects.toThrow(/non-canonical rows/)
    await db.exec('ROLLBACK')
  })
})
