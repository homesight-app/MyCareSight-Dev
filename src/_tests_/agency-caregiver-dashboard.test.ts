/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import { readAgencyCaregiverDashboardStats } from '@/lib/repositories/agency-caregiver-dashboard'

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

const id = (n: number) => `71000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const USER = id(1), AGENCY = id(2), FOREIGN = id(3), MEMBER_ONE = id(4), MEMBER_TWO = id(5)

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
    CREATE TABLE caregiver_members(id uuid PRIMARY KEY,agency_id uuid,status text);
    CREATE TABLE caregiver_credentials(id uuid PRIMARY KEY,agency_id uuid,caregiver_member_id uuid,expiration_date date);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,
      action text,performed_by_user_id uuid,details jsonb);
  `)
  await db.query("INSERT INTO user_profiles VALUES($1,'company_owner',$2,true)", [USER, AGENCY])
  await db.query("INSERT INTO user_agency_roles VALUES($1,$2,'company_owner','active')", [USER, AGENCY])
  await db.query("INSERT INTO caregiver_members VALUES($1,$3,'active'),($2,$3,'inactive')", [MEMBER_ONE, MEMBER_TWO, AGENCY])
  await db.query("INSERT INTO caregiver_credentials VALUES($1,$2,$3,CURRENT_DATE+10),($4,$2,$3,CURRENT_DATE+40)",
    [id(6), AGENCY, MEMBER_ONE, id(7)])
  jest.mocked(getSession).mockResolvedValue({ user: { id: USER } } as Awaited<ReturnType<typeof getSession>>)
})

afterAll(async () => { await db?.close() })

test('returns agency-scoped totals and writes an identifier-only audit', async () => {
  const result = await readAgencyCaregiverDashboardStats(AGENCY)
  expect(result).toEqual({ data: { totalStaff: 2, activeStaff: 1, expiringLicenses: 1 }, error: null })
  const audits = await db.query<{details: unknown}>('SELECT details FROM audit_log')
  expect(audits.rows).toHaveLength(1)
  expect(JSON.stringify(audits.rows)).toContain('read_caregiver_dashboard_stats')
})

test('rejects a caller-supplied foreign agency and inactive membership', async () => {
  expect((await readAgencyCaregiverDashboardStats(FOREIGN)).data).toBeNull()
  await db.exec("UPDATE user_agency_roles SET status='invited'")
  expect((await readAgencyCaregiverDashboardStats(AGENCY)).data).toBeNull()
})

test('returns no statistics when the audit cannot be committed', async () => {
  failAudit = true
  const result = await readAgencyCaregiverDashboardStats(AGENCY)
  expect(result.data).toBeNull()
  expect(result.error?.message).toBe('Unable to load caregiver dashboard statistics.')
})
