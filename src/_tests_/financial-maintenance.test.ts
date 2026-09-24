/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import { savePatientServiceContractBillRates, saveVisitMileage } from '@/lib/repositories/financial-maintenance'

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

const id = (n: number) => `60000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const USER=id(1), AGENCY=id(2), FOREIGN=id(3), CONTRACT_ONE=id(4), CONTRACT_TWO=id(5), FOREIGN_CONTRACT=id(6), VISIT=id(7)

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
    CREATE TABLE patient_service_contracts(id uuid PRIMARY KEY,agency_id uuid,bill_rate numeric,updated_at timestamptz DEFAULT now());
    CREATE TABLE scheduled_visits(id uuid PRIMARY KEY,agency_id uuid,mileage_miles numeric,updated_at timestamptz DEFAULT now());
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,
      action text,performed_by_user_id uuid,details jsonb);
  `)
  await db.query("INSERT INTO user_profiles VALUES($1,'company_owner',$2,true)",[USER,AGENCY])
  await db.query("INSERT INTO user_agency_roles VALUES($1,$2,'company_owner','active')",[USER,AGENCY])
  await db.query('INSERT INTO patient_service_contracts VALUES($1,$4,40,now()),($2,$4,50,now()),($3,$5,60,now())',
    [CONTRACT_ONE,CONTRACT_TWO,FOREIGN_CONTRACT,AGENCY,FOREIGN])
  await db.query('INSERT INTO scheduled_visits VALUES($1,$2,NULL,now())',[VISIT,AGENCY])
  jest.mocked(getSession).mockResolvedValue({user:{id:USER},profile:{role:'admin',agency_id:FOREIGN}} as Awaited<ReturnType<typeof getSession>>)
})

afterAll(async () => { await db?.close() })

test('bill-rate batch commits current contracts and identifier-only audits without financial backfill', async () => {
  const result=await savePatientServiceContractBillRates({rates:[
    {contractId:CONTRACT_ONE,billRate:41.25},{contractId:CONTRACT_TWO,billRate:51.75},
  ]})
  expect(result).toEqual({success:true})
  expect((await db.query<{bill_rate:number}>('SELECT bill_rate FROM patient_service_contracts WHERE agency_id=$1 ORDER BY id',[AGENCY])).rows
    .map(row=>Number(row.bill_rate))).toEqual([41.25,51.75])
  const audits=await db.query<{details:unknown}>('SELECT details FROM audit_log ORDER BY record_id')
  expect(audits.rows).toHaveLength(2)
  expect(JSON.stringify(audits.rows)).not.toContain('41.25')
  expect(JSON.stringify(audits.rows)).toContain('frozen_visit_financials_preserved')
})

test('cross-agency batch item and audit outage roll back every rate change', async () => {
  expect((await savePatientServiceContractBillRates({rates:[
    {contractId:CONTRACT_ONE,billRate:41},{contractId:FOREIGN_CONTRACT,billRate:61},
  ]})).success).toBe(false)
  expect(Number((await db.query<{bill_rate:number}>('SELECT bill_rate FROM patient_service_contracts WHERE id=$1',[CONTRACT_ONE])).rows[0].bill_rate)).toBe(40)
  failAudit=true
  expect((await savePatientServiceContractBillRates({rates:[{contractId:CONTRACT_ONE,billRate:41}]})).success).toBe(false)
  expect(Number((await db.query<{bill_rate:number}>('SELECT bill_rate FROM patient_service_contracts WHERE id=$1',[CONTRACT_ONE])).rows[0].bill_rate)).toBe(40)
})

test('mileage is validated, agency-scoped, and rolls back when audit fails', async () => {
  expect((await saveVisitMileage({scheduledVisitId:VISIT,mileageMiles:12.25})).success).toBe(true)
  expect(Number((await db.query<{mileage_miles:number}>('SELECT mileage_miles FROM scheduled_visits WHERE id=$1',[VISIT])).rows[0].mileage_miles)).toBe(12.25)
  expect((await saveVisitMileage({scheduledVisitId:VISIT,mileageMiles:-1})).fieldErrors?.mileageMiles).toBeDefined()
  failAudit=true
  expect((await saveVisitMileage({scheduledVisitId:VISIT,mileageMiles:15})).success).toBe(false)
  expect(Number((await db.query<{mileage_miles:number}>('SELECT mileage_miles FROM scheduled_visits WHERE id=$1',[VISIT])).rows[0].mileage_miles)).toBe(12.25)
})

test('inactive membership denies maintenance even when session profile claims another role', async () => {
  await db.exec("UPDATE user_agency_roles SET status='invited'")
  expect((await savePatientServiceContractBillRates({rates:[{contractId:CONTRACT_ONE,billRate:41}]})).success).toBe(false)
  expect((await saveVisitMileage({scheduledVisitId:VISIT,mileageMiles:10})).success).toBe(false)
})
