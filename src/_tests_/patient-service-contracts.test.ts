/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSession } from '@/lib/auth'
import {
  createServiceContract,
  deleteContract,
  readServiceContracts,
  updateContractDetails,
} from '@/lib/repositories/patient-service-contracts'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))

let db: PGlite
let failAudit = false

jest.mock('postgres', () => {
  type Executor = Pick<PGlite, 'query'>
  const makeTag = (executor: () => Executor) => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const fragment = {
      strings, values,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const params: unknown[] = []
        const compile = (part: { strings: readonly string[]; values: unknown[] }): string =>
          part.strings.reduce((text, chunk, index) => {
            if (index === part.values.length) return text + chunk
            const value = part.values[index]
            if (value && typeof value === 'object' && 'strings' in value && 'values' in value) {
              return text + chunk + compile(value as typeof part)
            }
            params.push(value)
            return text + chunk + '$' + params.length
          }, '')
        const query = compile(fragment)
        if (failAudit && query.includes('INSERT INTO public.audit_log')) {
          return Promise.reject(new Error('synthetic audit outage')).then(resolve, reject)
        }
        return executor().query(query, params).then(result => result.rows).then(resolve, reject)
      },
    }
    return fragment
  }
  const pool = Object.assign(makeTag(() => db), {
    begin: async (fn: (tx: ReturnType<typeof makeTag>) => Promise<unknown>) => db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE mycaresight_app')
      return fn(makeTag(() => tx))
    }),
  })
  return { __esModule: true, default: () => pool }
})

const id = (n: number) => `70000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const USER=id(1), AGENCY=id(2), FOREIGN=id(3), PATIENT=id(4), FOREIGN_PATIENT=id(5), CODE=id(6)

beforeAll(async () => {
  db = new PGlite()
  await db.exec('CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS')
}, 60000)

beforeEach(async () => {
  failAudit = false
  await db.exec(`
    RESET ROLE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO mycaresight_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mycaresight_app;
    CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,agency_id uuid,is_active boolean);
    CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE patients(id uuid PRIMARY KEY,agency_id uuid NOT NULL);
    CREATE TABLE billing_codes(id uuid PRIMARY KEY);
    CREATE TABLE patient_service_contracts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid NOT NULL,patient_id uuid NOT NULL,
      contract_name text,contract_type text NOT NULL,service_type text NOT NULL,billing_code_id uuid,
      bill_rate numeric,bill_unit_type text NOT NULL DEFAULT 'hour',weekly_hours_limit numeric,
      effective_date date NOT NULL,end_date date,status text NOT NULL DEFAULT 'active',note text,
      created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      bill_mileage boolean NOT NULL DEFAULT false,mileage_bill_rate_per_mile numeric);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,
      action text,performed_by_user_id uuid,details jsonb);
  `)
  await db.query("INSERT INTO user_profiles VALUES($1,'company_owner',$2,true)",[USER,AGENCY])
  await db.query("INSERT INTO user_agency_roles VALUES($1,$2,'company_owner','active')",[USER,AGENCY])
  await db.query('INSERT INTO patients VALUES($1,$3),($2,$4)',[PATIENT,FOREIGN_PATIENT,AGENCY,FOREIGN])
  await db.query('INSERT INTO billing_codes VALUES($1)',[CODE])
  jest.mocked(getSession).mockResolvedValue({user:{id:USER},profile:{role:'admin',agency_id:FOREIGN}} as Awaited<ReturnType<typeof getSession>>)
})

afterAll(async () => { await db?.close() })

const contract = (patient_id=PATIENT) => ({
  patient_id,contract_name:'Current plan',contract_type:'billing',service_type:'non_skilled' as const,
  billing_code_id:CODE,bill_rate:42,bill_unit_type:'hour' as const,weekly_hours_limit:20,
  effective_date:'2026-01-01',end_date:null,note:null,bill_mileage:false,mileage_bill_rate_per_mile:null,
})

test('creates and reads an agency-scoped contract with identifier-only audits', async () => {
  const created=await createServiceContract(contract())
  expect(created.error).toBeNull()
  expect(created.data?.status).toBe('active')
  const read=await readServiceContracts(PATIENT)
  expect(read.data).toHaveLength(1)
  const audits=await db.query<{details:unknown}>('SELECT details FROM audit_log ORDER BY action')
  expect(audits.rows).toHaveLength(2)
  expect(JSON.stringify(audits.rows)).not.toContain('Current plan')
  expect(JSON.stringify(audits.rows)).not.toContain('42')
})

test('rejects cross-agency patients and inactive memberships', async () => {
  expect((await createServiceContract(contract(FOREIGN_PATIENT))).error?.message).toMatch(/agency/i)
  await db.exec("UPDATE user_agency_roles SET status='invited'")
  expect((await createServiceContract(contract())).error).not.toBeNull()
  expect((await db.query('SELECT 1 FROM patient_service_contracts')).rows).toHaveLength(0)
})

test('detail and rate changes are atomic when audit insertion fails', async () => {
  const created=await createServiceContract(contract())
  failAudit=true
  const result=await updateContractDetails(created.data!.id,{contract_name:'Changed',bill_rate:99})
  expect(result.error).not.toBeNull()
  const row=(await db.query<{contract_name:string;bill_rate:number}>('SELECT contract_name,bill_rate FROM patient_service_contracts')).rows[0]
  expect(row.contract_name).toBe('Current plan')
  expect(Number(row.bill_rate)).toBe(42)
})

test('delete rolls back when its audit cannot be written', async () => {
  const created=await createServiceContract(contract())
  failAudit=true
  expect((await deleteContract(created.data!.id)).error).not.toBeNull()
  expect((await db.query('SELECT 1 FROM patient_service_contracts')).rows).toHaveLength(1)
})

test('013 installs forced RLS, exact policies, scoped grants, and the timeline index', async () => {
  await db.exec(`
    CREATE TABLE visit_financials(id uuid);
    ALTER TABLE visit_financials ENABLE ROW LEVEL SECURITY;
    CREATE POLICY visit_financials_manager_update ON visit_financials FOR UPDATE TO mycaresight_app USING (true) WITH CHECK (true);
    CREATE FUNCTION visit_financial_manager_can_read(uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT true';
    GRANT INSERT ON audit_log TO mycaresight_app;
    GRANT SELECT,INSERT,UPDATE,DELETE ON patient_service_contracts TO mycaresight_app;
  `)
  const migration=readFileSync(join(process.cwd(),'scripts/migrations/013-patient-service-contract-access.sql'),'utf8')
  await db.exec(migration)
  const [state]=((await db.query<{forced:boolean;policies:number;agency_update:boolean;index_ready:boolean}>(`
    SELECT c.relrowsecurity AND c.relforcerowsecurity forced,
      (SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='patient_service_contracts') policies,
      has_column_privilege('mycaresight_app','public.patient_service_contracts','agency_id','UPDATE') agency_update,
      to_regclass('public.patient_service_contracts_agency_patient_timeline_idx') IS NOT NULL index_ready
    FROM pg_class c WHERE c.oid='public.patient_service_contracts'::regclass`)).rows)
  expect(state).toEqual({forced:true,policies:4,agency_update:false,index_ready:true})
})
