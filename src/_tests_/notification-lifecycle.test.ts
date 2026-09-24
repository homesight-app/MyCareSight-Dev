/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import {
  deleteOwnNotification,
  markOwnNotificationAsRead,
  readRecentOwnNotifications,
  readUnreadNotificationItems,
  readUnreadNotificationsCount,
} from '@/lib/repositories/notification-lifecycle'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
let db: PGlite
let failAudit = false

jest.mock('postgres', () => {
  type Executor = Pick<PGlite, 'query'>
  const tag = (executor: () => Executor) => (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values,
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      const params: unknown[] = []
      const compile = (part: { strings: readonly string[]; values: unknown[] }): string => part.strings.reduce((out, chunk, index) => {
        if (index === part.values.length) return out + chunk
        const value = part.values[index]
        if (value && typeof value === 'object' && 'strings' in value && 'values' in value) return out + chunk + compile(value as typeof part)
        params.push(value); return out + chunk + '$' + params.length
      }, '')
      const query = compile(this)
      if (failAudit && query.includes('INSERT INTO public.audit_log')) return Promise.reject(new Error('audit outage')).then(resolve, reject)
      return executor().query(query, params).then(result => result.rows).then(resolve, reject)
    } })
  const pool = Object.assign(tag(() => db), { begin: async (fn: (tx: ReturnType<typeof tag>) => Promise<unknown>) => db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE mycaresight_app'); return fn(tag(() => tx))
  }) })
  return { __esModule: true, default: () => pool }
})

const id = (n: number) => `74000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const USER = id(1), OTHER = id(2), AGENCY = id(3), OWN = id(4), OTHER_NOTIFICATION = id(5)

beforeAll(async () => { db = new PGlite(); await db.exec('CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS') }, 60000)
beforeEach(async () => {
  failAudit = false
  await db.exec(`RESET ROLE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO mycaresight_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mycaresight_app;
    CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,agency_id uuid,is_active boolean);
    CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE notifications(id uuid PRIMARY KEY,user_id uuid,title text,message text,type text,is_read boolean,created_at timestamptz,icon_type text,action_url text);
    CREATE TABLE audit_log(agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);
    INSERT INTO user_profiles VALUES('${USER}','company_owner','${AGENCY}',true),('${OTHER}','admin',NULL,true);
    INSERT INTO user_agency_roles VALUES('${USER}','${AGENCY}','company_owner','active');
    INSERT INTO notifications VALUES
      ('${OWN}','${USER}','Own',NULL,'general',false,'2026-09-23T10:00:00Z',NULL,NULL),
      ('${id(6)}','${USER}','Read',NULL,'general',true,'2026-09-22T10:00:00Z',NULL,NULL),
      ('${OTHER_NOTIFICATION}','${OTHER}','Other',NULL,'general',false,'2026-09-23T11:00:00Z',NULL,NULL);`)
  jest.mocked(getSession).mockResolvedValue({ user: { id: USER } } as Awaited<ReturnType<typeof getSession>>)
})
afterAll(async () => { await db?.close() })

test('reads use current identity and reject a claimed different user', async () => {
  expect((await readUnreadNotificationItems(USER)).data?.map(row => row.id)).toEqual([OWN])
  expect((await readUnreadNotificationsCount(USER)).data).toEqual({ count: '1' })
  expect((await readRecentOwnNotifications()).data?.map(row => row.id)).toEqual([OWN, id(6)])
  expect((await readUnreadNotificationItems(OTHER)).data).toBeNull()
})

test('mark and delete can affect only notifications owned by the current actor', async () => {
  expect((await markOwnNotificationAsRead(OTHER_NOTIFICATION)).error?.message).toBe('Notification not found.')
  expect((await markOwnNotificationAsRead(OWN)).error).toBeNull()
  expect((await db.query<{ is_read: boolean }>('SELECT is_read FROM notifications WHERE id=$1', [OWN])).rows[0].is_read).toBe(true)
  expect((await deleteOwnNotification(id(6), USER)).error).toBeNull()
  expect((await db.query('SELECT 1 FROM notifications WHERE id=$1', [id(6)])).rows).toHaveLength(0)
})

test('inactive membership and audit outage fail closed and roll back mutations', async () => {
  await db.query("UPDATE user_agency_roles SET status='inactive'")
  expect((await readUnreadNotificationItems(USER)).data).toBeNull()
  await db.query("UPDATE user_agency_roles SET status='active'")
  failAudit = true
  expect((await markOwnNotificationAsRead(OWN)).error).not.toBeNull()
  expect((await db.query<{ is_read: boolean }>('SELECT is_read FROM notifications WHERE id=$1', [OWN])).rows[0].is_read).toBe(false)
})
