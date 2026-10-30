/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/025-capability-based-feature-plans.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/025-verify-capability-based-feature-plans.sql'),
  'utf8'
)
const catalogReseed = readFileSync(
  join(process.cwd(), 'scripts/migrations/025a-reseed-capability-catalog.sql'),
  'utf8'
)

const PLAN = '95000000-0000-4000-8000-000000000001'
const AGENCY = '95000000-0000-4000-8000-000000000002'
const ADMIN = '95000000-0000-4000-8000-000000000003'
const OWNER = '95000000-0000-4000-8000-000000000004'

describe('capability-based feature plan migration 025', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE feature_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        description text, sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE agencies (
        id uuid PRIMARY KEY, plan_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE plan_features (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL, feature_key text NOT NULL
      );
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY, role text NOT NULL, agency_id uuid, is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE user_agency_roles (user_id uuid, agency_id uuid, role text, status text);
      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid, table_name text NOT NULL,
        record_id uuid, action text NOT NULL, performed_by_user_id uuid, details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT USAGE ON SCHEMA public TO mycaresight_app;
      GRANT SELECT ON agencies, user_profiles, user_agency_roles TO mycaresight_app;
      INSERT INTO feature_plans (id, name) VALUES ('${PLAN}', 'Synthetic Plan');
      INSERT INTO agencies (id, plan_id) VALUES ('${AGENCY}', '${PLAN}');
      INSERT INTO plan_features (plan_id, feature_key) VALUES
        ('${PLAN}', 'care_visits'), ('${PLAN}', 'time_billing'),
        ('${PLAN}', 'clients_scheduling'), ('${PLAN}', 'caregivers');
      INSERT INTO user_profiles VALUES
        ('${ADMIN}', 'admin', NULL, true), ('${OWNER}', 'company_owner', '${AGENCY}', true);
      INSERT INTO user_agency_roles VALUES ('${OWNER}', '${AGENCY}', 'company_owner', 'active');
    `)
    await db.exec(migration)
  }, 60_000)

  afterAll(async () => db.close())

  test('normalizes grouped care operations and separate caregiver management', async () => {
    const rows = (await db.query<{ capability_key: string }>(
      'SELECT capability_key FROM plan_capabilities WHERE plan_id = $1 ORDER BY capability_key',
      [PLAN]
    )).rows
    expect(rows.map(row => row.capability_key)).toEqual(['care_operations', 'caregiver_management'])
  })

  test('passes integrity, constraint, and RLS verification', async () => {
    const results = await db.exec(verification)
    const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(row).toEqual(expect.objectContaining({
      catalog_seed_ok: true,
      care_operations_ok: true,
      caregiver_management_separate: true,
      duplicate_count: 0,
      orphan_count: 0,
      legacy_key_count: 0,
      unique_key_ok: true,
      foreign_keys_ok: true,
      agency_plan_fk_ok: true,
      catalog_rls_ok: true,
      plans_rls_ok: true,
      plan_capabilities_rls_ok: true,
      public_blocked: true,
      helper_not_public: true,
    }))
  })

  test('allows an active agency member to read only the assigned plan capabilities', async () => {
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      await tx.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER])
      const rows = await tx.query('SELECT capability_key FROM plan_capabilities ORDER BY capability_key')
      expect(rows.rows).toHaveLength(2)
    })
  })

  test('restores capability reference rows omitted by a schema-only copy', async () => {
    await db.exec(`
      UPDATE capability_catalog
      SET label = 'Drifted', description = 'Drifted', is_active = false;
      DELETE FROM capability_catalog
      WHERE key NOT IN (SELECT capability_key FROM plan_capabilities);
    `)

    await db.exec(catalogReseed)

    const catalog = (await db.query<{
      key: string
      label: string
      is_active: boolean
    }>('SELECT key, label, is_active FROM capability_catalog ORDER BY sort_order')).rows
    expect(catalog).toHaveLength(6)
    expect(catalog.every(row => row.is_active)).toBe(true)
    expect(catalog.find(row => row.key === 'care_operations')?.label).toBe('Care Operations')

    const results = await db.exec(verification)
    expect(results.flatMap(result => result.rows)[0]).toEqual(expect.objectContaining({
      catalog_seed_ok: true,
      care_operations_ok: true,
      caregiver_management_separate: true,
    }))
  })
})
