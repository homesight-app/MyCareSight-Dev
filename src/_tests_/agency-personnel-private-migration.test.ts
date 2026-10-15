/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(join(process.cwd(), 'scripts/migrations/026-agency-personnel-private-details.sql'), 'utf8')
const verification = readFileSync(join(process.cwd(), 'scripts/migrations/026-verify-agency-personnel-private-details.sql'), 'utf8')

const AGENCY = '26000000-0000-4000-8000-000000000001'
const ADMIN = '26000000-0000-4000-8000-000000000002'
const OWNER = '26000000-0000-4000-8000-000000000003'
const COORDINATOR = '26000000-0000-4000-8000-000000000004'
const KEY_STAFF = '26000000-0000-4000-8000-000000000005'

describe('agency personnel private migration 026', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE agencies (id uuid PRIMARY KEY);
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY, agency_id uuid, role text NOT NULL,
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE user_agency_roles (
        user_id uuid NOT NULL, agency_id uuid NOT NULL, role text NOT NULL, status text NOT NULL
      );
      CREATE TABLE agency_key_staff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid NOT NULL,
        officer_role text NOT NULL, officer_roles text[] NOT NULL DEFAULT '{}',
        full_legal_name text, telephone text, email text, date_of_birth date,
        ssn_encrypted text, ssn_last4 char(4), home_address_street text,
        home_address_city text, home_address_state text, home_address_zip text,
        date_of_hire date, is_licensed boolean, license_type text,
        user_profile_id uuid, status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        ownership_percentage text, professional_license_number text, employment_type text
      );
      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid, table_name text NOT NULL,
        record_id uuid, action text NOT NULL, performed_by_user_id uuid, details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE FUNCTION skill_actor_is_platform_admin() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
        SELECT EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND role = 'admin' AND is_active
        )
      $$;
      CREATE FUNCTION skill_actor_can_manage_agency(p_agency_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
        SELECT EXISTS (
          SELECT 1 FROM user_profiles profile
          JOIN user_agency_roles membership ON membership.user_id = profile.id
            AND membership.agency_id = p_agency_id
            AND membership.role = profile.role AND membership.status = 'active'
          WHERE profile.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND profile.is_active AND profile.role IN ('company_owner', 'care_coordinator')
        )
      $$;
      CREATE FUNCTION skill_actor_is_agency_owner(p_agency_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
        SELECT EXISTS (
          SELECT 1 FROM user_profiles profile
          JOIN user_agency_roles membership ON membership.user_id = profile.id
            AND membership.agency_id = p_agency_id
            AND membership.role = 'company_owner' AND membership.status = 'active'
          WHERE profile.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND profile.is_active AND profile.role = 'company_owner'
        )
      $$;

      REVOKE ALL ON FUNCTION skill_actor_is_platform_admin() FROM PUBLIC;
      REVOKE ALL ON FUNCTION skill_actor_can_manage_agency(uuid) FROM PUBLIC;
      REVOKE ALL ON FUNCTION skill_actor_is_agency_owner(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION skill_actor_is_platform_admin() TO mycaresight_app;
      GRANT EXECUTE ON FUNCTION skill_actor_can_manage_agency(uuid) TO mycaresight_app;
      GRANT EXECUTE ON FUNCTION skill_actor_is_agency_owner(uuid) TO mycaresight_app;
      GRANT USAGE ON SCHEMA public TO mycaresight_app;
      GRANT SELECT ON agencies, user_profiles, user_agency_roles TO mycaresight_app;

      INSERT INTO agencies VALUES ('${AGENCY}');
      INSERT INTO user_profiles VALUES
        ('${ADMIN}', NULL, 'admin', true),
        ('${OWNER}', '${AGENCY}', 'company_owner', true),
        ('${COORDINATOR}', '${AGENCY}', 'care_coordinator', true);
      INSERT INTO user_agency_roles VALUES
        ('${OWNER}', '${AGENCY}', 'company_owner', 'active'),
        ('${COORDINATOR}', '${AGENCY}', 'care_coordinator', 'active');
      INSERT INTO agency_key_staff (
        id, agency_id, officer_role, user_profile_id, date_of_birth, date_of_hire,
        ssn_encrypted, ssn_last4, home_address_street, home_address_city,
        home_address_state, home_address_zip
      ) VALUES (
        '${KEY_STAFF}', '${AGENCY}', 'president', '${OWNER}', '1980-01-01', '2020-02-03',
        'legacy-ciphertext', '6789', '1 Synthetic Way', 'Testville', 'CA', '90210'
      );
    `)
    await db.exec(migration)
  }, 60_000)

  afterAll(async () => db.close())

  test('applies the schema and passes the read-only verifier', async () => {
    const results = await db.exec(verification)
    expect(results.flatMap(result => result.rows)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rls_enabled: true, rls_forced: true }),
    ]))
  })

  test('backfills legacy key-staff data with explicit key metadata', async () => {
    const rows = (await db.query<{
      birth_date: string
      ssn_last4: string
      ssn_key_id: string
      home_address_state: string
    }>(`
      SELECT birth_date::text, ssn_last4, ssn_key_id, home_address_state
      FROM agency_personnel_private WHERE agency_id = $1 AND user_id = $2
    `, [AGENCY, OWNER])).rows
    expect(rows).toEqual([{
      birth_date: '1980-01-01',
      ssn_last4: '6789',
      ssn_key_id: 'legacy',
      home_address_state: 'CA',
    }])
  })

  test('allows coordinator employment updates but blocks restricted fields', async () => {
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      await tx.query("SELECT set_config('app.current_user_id',$1,true)", [COORDINATOR])
      await tx.query("UPDATE agency_personnel_private SET hire_date = '2024-04-05' WHERE agency_id = $1 AND user_id = $2", [AGENCY, OWNER])
    })

    await expect(db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      await tx.query("SELECT set_config('app.current_user_id',$1,true)", [COORDINATOR])
      await tx.query("UPDATE agency_personnel_private SET birth_date = '1981-01-01' WHERE agency_id = $1 AND user_id = $2", [AGENCY, OWNER])
    })).rejects.toThrow(/Only an agency owner or platform administrator/)
  })

  test('allows the active agency owner to update restricted fields', async () => {
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      await tx.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER])
      await tx.query("UPDATE agency_personnel_private SET birth_date = '1981-01-01' WHERE agency_id = $1 AND user_id = $2", [AGENCY, OWNER])
    })
    const row = (await db.query<{ birth_date: string }>(
      'SELECT birth_date::text FROM agency_personnel_private WHERE agency_id = $1 AND user_id = $2',
      [AGENCY, OWNER],
    )).rows[0]
    expect(row.birth_date).toBe('1981-01-01')
  })

  test('stores only encrypted SSN material and masked display metadata', () => {
    expect(migration).toContain('ssn_encrypted text')
    expect(migration).toContain('ssn_last4 char(4)')
    expect(migration).toContain('ssn_key_id text')
    expect(migration).toContain('Plaintext SSNs must never be stored in PostgreSQL')
    expect(migration).not.toContain('GRANT DELETE ON public.agency_personnel_private')
  })
})
