/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AGENCY = '90000000-0000-4000-8000-000000000001'
const OTHER_AGENCY = '90000000-0000-4000-8000-000000000002'
const USER = '90000000-0000-4000-8000-000000000003'
const VISIT = '90000000-0000-4000-8000-000000000004'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.agencies(id uuid PRIMARY KEY);
    CREATE TABLE public.user_profiles(id uuid PRIMARY KEY);
    CREATE TABLE public.caregiver_members(id uuid PRIMARY KEY);
    CREATE TABLE public.scheduled_visits(id uuid PRIMARY KEY,agency_id uuid NOT NULL);
    INSERT INTO public.agencies VALUES ('${AGENCY}'),('${OTHER_AGENCY}');
    INSERT INTO public.user_profiles VALUES ('${USER}');
    INSERT INTO public.scheduled_visits VALUES ('${VISIT}','${AGENCY}');
    CREATE FUNCTION public.visit_financial_manager_can_read(target uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT target::text = current_setting('app.current_agency_id',true)
          AND current_setting('app.current_user_role',true) IN ('company_owner','care_coordinator')
      $$;
    GRANT USAGE ON SCHEMA public TO mycaresight_app;
    GRANT SELECT ON public.scheduled_visits TO mycaresight_app;
    GRANT EXECUTE ON FUNCTION public.visit_financial_manager_can_read(uuid) TO mycaresight_app;
  `)
  await db.exec(readFileSync(join(process.cwd(), 'scripts/migrations/030-visit-correction-history.sql'), 'utf8'))
}, 60000)

afterAll(async () => { await db?.close() })

async function asApp(role: string, agencyId: string, statement: string) {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE mycaresight_app')
    await tx.query(`SELECT set_config('app.current_user_id',$1,true),
      set_config('app.current_user_role',$2,true),set_config('app.current_agency_id',$3,true)`,
    [USER, role, agencyId])
    return tx.query(statement)
  })
}

test('030 creates forced, append-only RLS with no update or delete grant', async () => {
  const { rows } = await db.query<{ forced:boolean; policies:number; can_update:boolean; can_delete:boolean }>(`
    SELECT c.relrowsecurity AND c.relforcerowsecurity AS forced,
      (SELECT count(*)::integer FROM pg_policies p WHERE p.tablename='visit_corrections') AS policies,
      has_table_privilege('mycaresight_app','public.visit_corrections','UPDATE') AS can_update,
      has_table_privilege('mycaresight_app','public.visit_corrections','DELETE') AS can_delete
    FROM pg_class c WHERE c.oid='public.visit_corrections'::regclass`)
  expect(rows).toEqual([{ forced: true, policies: 2, can_update: false, can_delete: false }])
})

test('only the agency owner can append a correction for an owned visit', async () => {
  const insert = (agencyId: string) => `INSERT INTO public.visit_corrections
    (agency_id,scheduled_visit_id,corrected_by_user_id,previous_status,corrected_status,reason)
    VALUES ('${agencyId}','${VISIT}','${USER}','completed','missed',
      'Synthetic correction after verification.') RETURNING id`
  expect((await asApp('company_owner', AGENCY, insert(AGENCY))).rows).toHaveLength(1)
  await expect(asApp('care_coordinator', AGENCY, insert(AGENCY))).rejects.toThrow()
  await expect(asApp('company_owner', OTHER_AGENCY, insert(OTHER_AGENCY))).rejects.toThrow()
  const ownerRead = await asApp('company_owner', AGENCY, 'SELECT id FROM public.visit_corrections')
  expect(ownerRead.rows).toHaveLength(1)
  const coordinatorRead = await asApp('care_coordinator', AGENCY, 'SELECT id FROM public.visit_corrections')
  expect(coordinatorRead.rows).toHaveLength(0)
})
