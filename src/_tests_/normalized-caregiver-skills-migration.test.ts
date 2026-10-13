/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')
const id = (n: number) => `a4000000-0000-4000-8000-${n.toString().padStart(12, '0')}`

let db: PGlite
const AGENCY = id(1)
const OWNER = id(2)
const CAREGIVER_USER = id(3)
const CAREGIVER = id(4)
const PATIENT = id(5)
const WOUND = id(6)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE mycaresight_jobs LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.agencies(id uuid PRIMARY KEY);
    CREATE TABLE public.user_profiles(id uuid PRIMARY KEY,role text,agency_id uuid,is_active boolean);
    CREATE TABLE public.user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE public.caregiver_members(
      id uuid PRIMARY KEY,agency_id uuid REFERENCES public.agencies(id),user_id uuid,
      status text,skills text[],updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.patients(id uuid PRIMARY KEY,agency_id uuid REFERENCES public.agencies(id));
    CREATE TABLE public.patient_skill_requirements(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,patient_id uuid UNIQUE,
      skill_codes text[] NOT NULL DEFAULT '{}',preferred_skill_codes text[] NOT NULL DEFAULT '{}',
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.configuration_types(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE,name text,description text,
      supports_hierarchy boolean,is_admin_manageable boolean,is_active boolean
    );
    CREATE TABLE public.configuration_values(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type_id uuid,parent_id uuid,code text,name text,
      description text,sort_order integer DEFAULT 0,is_active boolean DEFAULT true,
      created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.credential_catalog(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE,name text,credential_type text,
      service_type text,is_active boolean DEFAULT true,display_order integer DEFAULT 0,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.audit_log(
      agency_id uuid,table_name text,record_id uuid,action text,
      performed_by_user_id uuid,details jsonb
    );
    INSERT INTO public.agencies VALUES ('${AGENCY}');
    INSERT INTO public.user_profiles VALUES
      ('${OWNER}','company_owner','${AGENCY}',true),
      ('${CAREGIVER_USER}','staff_member','${AGENCY}',true);
    INSERT INTO public.user_agency_roles VALUES
      ('${OWNER}','${AGENCY}','company_owner','active'),
      ('${CAREGIVER_USER}','${AGENCY}','staff_member','active');
    INSERT INTO public.caregiver_members(id,agency_id,user_id,status,skills)
      VALUES('${CAREGIVER}','${AGENCY}','${CAREGIVER_USER}','active',ARRAY['Wound Care']);
    INSERT INTO public.patients VALUES('${PATIENT}','${AGENCY}');
    INSERT INTO public.patient_skill_requirements(agency_id,patient_id,skill_codes,preferred_skill_codes)
      VALUES('${AGENCY}','${PATIENT}',ARRAY['Wound Care'],ARRAY['Spanish']);
    INSERT INTO public.credential_catalog(id,code,name,credential_type,is_active)
      VALUES('${WOUND}','WOUND_CARE','Wound Care','skill',true);
    GRANT SELECT ON public.caregiver_members, public.user_agency_roles TO mycaresight_app;
  `)
  await db.exec(read('024-normalized-caregiver-skills.sql'))
}, 60000)

afterAll(async () => { await db?.close() })

test('backfills legacy caregiver and client skills with stable catalog references', async () => {
  const caregiver = (await db.query<{ verification_status: string; name: string }>(`
    SELECT assignment.verification_status,catalog.name
    FROM caregiver_skill_assignments assignment
    JOIN credential_catalog catalog ON catalog.id=assignment.credential_id
  `)).rows
  expect(caregiver).toEqual([{ verification_status: 'verified', name: 'Wound Care' }])

  const requirements = (await db.query<{ name: string; requirement_level: string }>(`
    SELECT catalog.name,item.requirement_level
    FROM patient_skill_requirement_items item
    JOIN credential_catalog catalog ON catalog.id=item.credential_id
    ORDER BY catalog.name
  `)).rows
  expect(requirements).toEqual([
    { name: 'Spanish', requirement_level: 'preferred' },
    { name: 'Wound Care', requirement_level: 'required' },
  ])
  expect((await db.query(`SELECT 1 FROM credential_catalog WHERE credential_type='skill' AND category_id IS NULL`)).rows).toEqual([])
})

test('caregiver can self-report while only verified skills satisfy a required match', async () => {
  const [other] = (await db.query<{ id: string }>(`
    INSERT INTO credential_catalog(code,name,credential_type,is_active,scope,category_id)
    SELECT 'MEAL_PREP','Meal Preparation','skill',true,'system',category_id
    FROM credential_catalog WHERE id=$1 RETURNING id
  `, [WOUND])).rows

  await db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE mycaresight_app')
    await tx.query(
      "SELECT set_config('app.current_user_id',$1,true),set_config('app.current_user_role','staff_member',true),set_config('app.current_agency_id',$2,true)",
      [CAREGIVER_USER, AGENCY]
    )
    await tx.query(`
      INSERT INTO caregiver_skill_assignments(
        agency_id,caregiver_member_id,credential_id,verification_status,added_by_user_id
      ) VALUES($1,$2,$3,'self_reported',$4)
    `, [AGENCY, CAREGIVER, other.id, CAREGIVER_USER])
  })

  const match = (await db.query<{ eligible: boolean }>(`
    SELECT NOT EXISTS (
      SELECT 1 FROM patient_skill_requirement_items requirement
      WHERE requirement.patient_id=$1 AND requirement.requirement_level='required'
        AND NOT EXISTS (
          SELECT 1 FROM caregiver_skill_assignments assignment
          WHERE assignment.caregiver_member_id=$2
            AND assignment.credential_id=requirement.credential_id
            AND assignment.verification_status='verified'
        )
    ) AS eligible
  `, [PATIENT, CAREGIVER])).rows[0]
  expect(match.eligible).toBe(true)
  expect((await db.query(`SELECT 1 FROM caregiver_skill_assignments WHERE credential_id=$1 AND verification_status='verified'`, [other.id])).rows).toEqual([])
})

test('verification script reports a complete installation', async () => {
  const results = await db.exec(read('024-verify-normalized-caregiver-skills.sql'))
  const row = results.at(-1)?.rows[0] as Record<string, unknown>
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('_count')) expect(value).toBe(0)
    else expect(value).toBe(true)
  }
})
