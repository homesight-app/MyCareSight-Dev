/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSession } from '@/lib/auth'
import { getCaregiverSkillCatalogFromTaskRequirements as catalog } from '@/lib/repositories/credential-catalog'
import { getCaregiverSkillCatalogAction } from '@/app/actions/reference-data'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/supabase/query', () => jest.requireActual('@/lib/repositories/credential-catalog'))
jest.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown, keys: string[]) => {
    if (keys.includes('ref-caregiver-skill-catalog')) throw new Error('Credential authorization must not be cached')
    return fn
  },
}))

let mockDb: PGlite
let mockExecutor: Pick<PGlite, 'query'>
let mockFailQuery = false
jest.mock('@/db', () => ({
  __esModule: true,
  default: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, chunk, i) => text + chunk + (i < values.length ? '$' + (i + 1) : ''), '')
    if (mockFailQuery) return Promise.reject(new Error('synthetic sensitive database details'))
    return mockExecutor.query(query, values).then(result => result.rows)
  },
  withUserContext: async (id: string, role: string, agency: string | null, fn: () => Promise<unknown>) =>
    mockDb.transaction(async tx => {
      mockExecutor = tx
      try {
        await tx.query('SET LOCAL ROLE mycaresight_app')
        await tx.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.current_user_role',$2,true),set_config('app.current_agency_id',$3,true)", [id,role,agency ?? ''])
        return await fn()
      } finally { mockExecutor = mockDb }
    }),
}))

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')
const migration = read('004-credential-catalog-read-access.sql')
const id = (n: number) => '30000000-0000-4000-8000-' + n.toString().padStart(12,'0')
const ACTOR=id(1), AGENCY=id(2)
function login() {
  // Deliberately stale role must never grant platform privileges.
  jest.mocked(getSession).mockResolvedValue({ user: { id: ACTOR }, profile: { role:'admin' } } as Awaited<ReturnType<typeof getSession>>)
}

beforeAll(async () => {
  mockDb = new PGlite()
  mockExecutor = mockDb
  await mockDb.exec('CREATE ROLE mycaresight_app LOGIN NOBYPASSRLS NOSUPERUSER')
},60000)
beforeEach(async () => {
  mockFailQuery=false
  await mockDb.exec(`
    RESET ROLE;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO mycaresight_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mycaresight_app;
    CREATE TABLE public.user_profiles(id uuid PRIMARY KEY, role text NOT NULL, is_active boolean NOT NULL);
    CREATE TABLE public.user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE public.task_required_credentials(id uuid PRIMARY KEY,task_id uuid,credential_id uuid,created_at timestamptz);
    CREATE TABLE public.task_catalog(id uuid PRIMARY KEY,category_id uuid);
    CREATE TABLE public.task_categories(id uuid PRIMARY KEY,name text);
  `)
  for (const table of ['agencies','caregiver_members','patients','scheduled_visits','billing_codes','patient_service_contracts']) {
    await mockDb.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY)`)
  }
  await mockDb.exec(read('002-stage-missing-application-tables.sql'))
  await mockDb.exec(read('003-seed-synthetic-credentials.sql'))
  await mockDb.query("INSERT INTO public.user_profiles VALUES ($1,'company_owner',true)",[ACTOR])
  await mockDb.query("INSERT INTO public.user_agency_roles VALUES ($1,$2,'company_owner','active')",[ACTOR,AGENCY])
  await mockDb.query("INSERT INTO public.task_categories VALUES ($1,' Synthetic category ')",[id(10)])
  await mockDb.query('INSERT INTO public.task_catalog VALUES ($1,$2)',[id(11),id(10)])
  await mockDb.query(`INSERT INTO public.task_required_credentials VALUES
    ($1,$3,'10000000-0000-4000-8000-000000000003','2026-01-01'),
    ($2,$4,'10000000-0000-4000-8000-000000000003','2026-01-02')`,[id(12),id(13),id(99),id(11)])
  await mockDb.exec(migration)
  login()
})
afterAll(async () => { await mockDb?.close() })

test('actual RLS permits reference reads and preserves deduplication/category preference',async () => {
  expect(await catalog()).toEqual({data:[{name:'Synthetic test skill',type:'Synthetic category'}],error:null})
  const results=await mockDb.exec(read('004-verify-credential-catalog-read-access.sql'))
  expect(results[0].rows[0]).toMatchObject({access_pass:true,runtime_write:false})
})

test.each(['admin','expert'])('active platform %s can read without agency membership',async role => {
  await mockDb.query('UPDATE public.user_profiles SET role=$1',[role])
  await mockDb.exec('TRUNCATE public.user_agency_roles')
  expect((await catalog()).data).toHaveLength(1)
})

test.each(['company_owner','care_coordinator','staff_member'])('active matching %s membership can read',async role => {
  await mockDb.query('UPDATE public.user_profiles SET role=$1',[role])
  await mockDb.query('UPDATE public.user_agency_roles SET role=$1',[role])
  expect((await catalog()).data).toHaveLength(1)
})

test.each(['invited','pending','inactive'])('denies %s membership in repository and database policy',async status => {
  await mockDb.query('UPDATE public.user_agency_roles SET status=$1',[status])
  expect((await catalog()).error?.message).toBe('Forbidden')
  await mockDb.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE mycaresight_app')
    await tx.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.current_user_role','admin',true)",[ACTOR])
    expect((await tx.query('SELECT id FROM public.credential_catalog')).rows).toEqual([])
  })
})

test('denies missing/mismatched membership, inactive account, unknown role, and missing session',async () => {
  await mockDb.exec("UPDATE public.user_agency_roles SET role='staff_member'")
  expect((await catalog()).error?.message).toBe('Forbidden')
  await mockDb.exec('TRUNCATE public.user_agency_roles')
  expect((await catalog()).error?.message).toBe('Forbidden')
  await mockDb.exec("UPDATE public.user_profiles SET role='admin',is_active=false")
  expect((await catalog()).error?.message).toBe('Forbidden')
  await mockDb.exec("UPDATE public.user_profiles SET role='unexpected',is_active=true")
  expect((await catalog()).error?.message).toBe('Forbidden')
  jest.mocked(getSession).mockResolvedValue(null)
  expect((await catalog()).error?.message).toBe('Unauthorized')
})

test('compatibility reference action checks authorization again after success',async () => {
  expect((await getCaregiverSkillCatalogAction()).data).toHaveLength(1)
  await mockDb.exec('UPDATE public.user_profiles SET is_active=false')
  expect((await getCaregiverSkillCatalogAction()).error?.message).toBe('Forbidden')
})

test('runtime cannot write catalog or access the other staged tables; absent context denies reads',async () => {
  await mockDb.exec('SET ROLE mycaresight_app')
  try {
    expect((await mockDb.query('SELECT id FROM public.credential_catalog')).rows).toEqual([])
    for (const statement of [
      "INSERT INTO public.credential_catalog(code,name,credential_type) VALUES ('TEST_X','Synthetic','skill')",
      "UPDATE public.credential_catalog SET name='Synthetic change'",
      'DELETE FROM public.credential_catalog',
      'TRUNCATE public.credential_catalog',
    ]) await expect(mockDb.exec(statement)).rejects.toMatchObject({code:'42501'})
    for (const table of ['caregiver_pay_rates','internal_notes','visit_time_entries','visit_approvals','visit_financials','visit_adjustment_history']) {
      await expect(mockDb.exec(`SELECT id FROM public.${table}`)).rejects.toMatchObject({code:'42501'})
    }
  } finally { await mockDb.exec('RESET ROLE') }
})

test('transaction-local context is cleared after allowed and rejected requests',async () => {
  await catalog()
  await mockDb.exec("UPDATE public.user_agency_roles SET status='pending'")
  await catalog()
  await mockDb.exec('SET ROLE mycaresight_app')
  try { expect((await mockDb.query('SELECT id FROM public.credential_catalog')).rows).toEqual([]) }
  finally { await mockDb.exec('RESET ROLE') }
})

test('database errors remain generic and serializable',async () => {
  mockFailQuery=true
  expect(await catalog()).toEqual({data:null,error:{message:'Unable to load skill catalog'}})
})

test('repeat migration aborts without altering the installed policy',async () => {
  await expect(mockDb.exec(migration)).rejects.toThrow('004 requires untouched staging access')
  await mockDb.exec('ROLLBACK')
  expect((await catalog()).data).toHaveLength(1)
})
