/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import {
  authorizeAndAuditAgencyLeadRead,
  readAgencyLeadStageCounts,
} from '@/lib/repositories/agency-lead-reads'

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

const id = (n: number) => `73000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const USER = id(1), AGENCY = id(2), FOREIGN_AGENCY = id(3), LEAD = id(4), FOREIGN_LEAD = id(5)

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
    CREATE TABLE leads(id uuid PRIMARY KEY,agency_id uuid,lead_type text,status text,stage text);
    CREATE TABLE audit_log(agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);
    INSERT INTO user_profiles VALUES('${USER}','company_owner','${AGENCY}',true);
    INSERT INTO user_agency_roles VALUES('${USER}','${AGENCY}','company_owner','active');
    INSERT INTO leads VALUES
      ('${LEAD}','${AGENCY}','patient','active','new'),
      ('${id(6)}','${AGENCY}','patient','active','new'),
      ('${id(7)}','${AGENCY}','patient','inactive','closed'),
      ('${id(8)}','${AGENCY}','caregiver','active','new'),
      ('${FOREIGN_LEAD}','${FOREIGN_AGENCY}','patient','active','qualified');
  `)
  jest.mocked(getSession).mockResolvedValue({ user: { id: USER } } as Awaited<ReturnType<typeof getSession>>)
})

afterAll(async () => { await db?.close() })

test('lead detail authorization requires current membership and agency ownership', async () => {
  expect(await authorizeAndAuditAgencyLeadRead(AGENCY, LEAD)).toEqual({ allowed: true })
  expect((await db.query<{ action: string }>('SELECT action FROM audit_log')).rows).toEqual([{ action: 'VIEW_LEAD' }])
  expect((await authorizeAndAuditAgencyLeadRead(AGENCY, FOREIGN_LEAD)).allowed).toBe(false)

  await db.query("UPDATE user_agency_roles SET status='inactive'")
  expect((await authorizeAndAuditAgencyLeadRead(AGENCY, LEAD)).allowed).toBe(false)
})

test('pipeline counts include only active patient leads in the current agency', async () => {
  expect((await readAgencyLeadStageCounts(AGENCY)).data).toEqual([{ stage: 'new', count: 2 }])
  expect((await readAgencyLeadStageCounts(FOREIGN_AGENCY)).data).toBeNull()
})

test('audit failure suppresses lead data and authorization', async () => {
  failAudit = true
  expect((await readAgencyLeadStageCounts(AGENCY)).data).toBeNull()
  expect((await authorizeAndAuditAgencyLeadRead(AGENCY, LEAD)).allowed).toBe(false)
})
