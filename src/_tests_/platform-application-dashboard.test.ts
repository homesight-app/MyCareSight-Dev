/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import {
  readAdminExpertEmail,
  readAdminLeadPlatformStaff,
  readAdminProgramReferences,
  readAdminClientDashboardMetrics,
  readExpertClientDashboardMetrics,
  readExpertProgramPlaybookId,
} from '@/lib/repositories/platform-application-dashboard'

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

const id = (n: number) => `72000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const ADMIN = id(1), EXPERT = id(2), OTHER_EXPERT = id(3), CLIENT_ONE = id(4), CLIENT_TWO = id(5)

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
    CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,is_active boolean,full_name text,email text);
    CREATE TABLE applications(id uuid PRIMARY KEY,assigned_expert_id uuid,status text);
    CREATE TABLE agency_admins(id uuid PRIMARY KEY);
    CREATE TABLE configuration_values(id uuid PRIMARY KEY,name text);
    CREATE TABLE playbook_items(id uuid PRIMARY KEY,playbook_id uuid);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,
      action text,performed_by_user_id uuid,details jsonb);
  `)
  await db.query("INSERT INTO user_profiles VALUES($1,'admin',true,'Admin One','admin@example.test'),($2,'expert',true,'Expert One','expert@example.test'),($3,'expert',true,'Expert Two','other@example.test')",
    [ADMIN, EXPERT, OTHER_EXPERT])
  await db.query('INSERT INTO agency_admins VALUES($1),($2)', [CLIENT_ONE, CLIENT_TWO])
  await db.query("INSERT INTO applications VALUES($1,$4,'requested'),($2,$4,'under_review'),($3,$5,'completed')",
    [id(6), id(7), id(8), EXPERT, OTHER_EXPERT])
  jest.mocked(getSession).mockResolvedValue({ user: { id: ADMIN } } as Awaited<ReturnType<typeof getSession>>)
})

afterAll(async () => { await db?.close() })

test('admin metrics include global application counts and client ids', async () => {
  const result = await readAdminClientDashboardMetrics()
  expect(result.data).toEqual({ activeApplicationCount: 2, pendingReviewCount: 1, clientIds: [CLIENT_ONE, CLIENT_TWO] })
  expect((await db.query('SELECT 1 FROM audit_log')).rows).toHaveLength(1)
})

test('expert metrics are restricted to the current active expert', async () => {
  jest.mocked(getSession).mockResolvedValue({ user: { id: EXPERT } } as Awaited<ReturnType<typeof getSession>>)
  expect((await readExpertClientDashboardMetrics(EXPERT)).data).toEqual({ totalCount: 2, activeCount: 2, pendingCount: 1 })
  expect((await readExpertClientDashboardMetrics(OTHER_EXPERT)).data).toBeNull()
})

test('inactive actors and audit failure return no metrics', async () => {
  await db.query('UPDATE user_profiles SET is_active=false WHERE id=$1', [ADMIN])
  expect((await readAdminClientDashboardMetrics()).data).toBeNull()
  await db.query('UPDATE user_profiles SET is_active=true WHERE id=$1', [ADMIN])
  failAudit = true
  expect((await readAdminClientDashboardMetrics()).data).toBeNull()
})

test('admin lead staff and program references use current active admin access', async () => {
  const category = id(9), subcategory = id(10), playbookItem = id(11), playbook = id(12)
  await db.query('INSERT INTO configuration_values VALUES($1,$2),($3,$4)', [category, 'Category', subcategory, 'Subcategory'])
  await db.query('INSERT INTO playbook_items VALUES($1,$2)', [playbookItem, playbook])

  const staff = await readAdminLeadPlatformStaff()
  expect(staff.data?.map(row => row.id)).toEqual([ADMIN, EXPERT, OTHER_EXPERT])
  expect((await readAdminProgramReferences({ categoryId: category, subcategoryId: subcategory, playbookItemId: playbookItem })).data)
    .toEqual({ categoryName: 'Category', subcategoryName: 'Subcategory', playbookId: playbook })
})

test('admin expert email read requires a current active admin and records the target', async () => {
  expect((await readAdminExpertEmail(EXPERT)).data).toEqual({ email: 'expert@example.test' })
  expect((await db.query<{ record_id: string }>('SELECT record_id FROM audit_log')).rows.at(-1)?.record_id).toBe(EXPERT)

  jest.mocked(getSession).mockResolvedValue({ user: { id: EXPERT } } as Awaited<ReturnType<typeof getSession>>)
  expect((await readAdminExpertEmail(ADMIN)).data).toBeNull()
})

test('expert program lookup is limited to applications assigned to the current expert', async () => {
  const playbookItem = id(13), playbook = id(14)
  await db.query('INSERT INTO playbook_items VALUES($1,$2)', [playbookItem, playbook])
  jest.mocked(getSession).mockResolvedValue({ user: { id: EXPERT } } as Awaited<ReturnType<typeof getSession>>)

  expect((await readExpertProgramPlaybookId(id(6), playbookItem)).data).toEqual({ playbookId: playbook })
  expect((await readExpertProgramPlaybookId(id(8), playbookItem)).data).toBeNull()
})
