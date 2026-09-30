/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import {
  readNotificationBadgeSnapshot,
  readNotificationDropdownSnapshot,
} from '@/lib/repositories/notification-dropdown'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))

let db: PGlite
let executor: Pick<PGlite, 'query'>
let failAudit = false

jest.mock('@/db', () => {
  type Fragment = { strings: readonly string[]; values: unknown[] }
  const compile = (fragment: Fragment, params: unknown[]): string =>
    fragment.strings.reduce((text, chunk, index) => {
      if (index === fragment.values.length) return text + chunk
      const value = fragment.values[index]
      if (value && typeof value === 'object' && 'strings' in value && 'values' in value) {
        return text + chunk + compile(value as Fragment, params)
      }
      params.push(value)
      return text + chunk + '$' + params.length
    }, '')

  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const fragment = {
      strings,
      values,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const params: unknown[] = []
        const query = compile(fragment, params)
        if (failAudit && query.includes('INSERT INTO public.audit_log')) {
          return Promise.reject(new Error('synthetic audit outage')).then(resolve, reject)
        }
        return executor.query(query, params).then(result => result.rows).then(resolve, reject)
      },
    }
    return fragment
  }

  return {
    __esModule: true,
    default: tag,
    withUserContext: async (userId: string, role: string, agencyId: string | null, fn: () => Promise<unknown>) =>
      db.transaction(async tx => {
        executor = tx
        await tx.query(
          `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true), set_config('app.current_agency_id', $3, true)`,
          [userId, role, agencyId ?? '']
        )
        try { return await fn() } finally { executor = db }
      }),
  }
})

const id = (n: number) => `76000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const ADMIN = id(1), OWNER = id(2), EXPERT = id(3), STAFF = id(4), OTHER = id(5)
const AGENCY = id(10), OTHER_AGENCY = id(11)
const OWN_APP = id(20), OTHER_APP = id(21), EXPERT_APP = id(22)
const OWN_CONVERSATION = id(30), OTHER_CONVERSATION = id(31), EXPERT_CONVERSATION = id(32)

function login(userId: string, role: string, agencyId: string | null) {
  jest.mocked(getSession).mockResolvedValue({
    user: { id: userId },
    profile: { id: userId, role, agency_id: agencyId, is_active: true },
  } as Awaited<ReturnType<typeof getSession>>)
}

beforeAll(async () => {
  db = new PGlite()
  executor = db
  await db.exec(`
    CREATE TABLE public.user_profiles(id uuid PRIMARY KEY, role text, agency_id uuid, is_active boolean);
    CREATE TABLE public.user_agency_roles(user_id uuid, agency_id uuid, role text, status text);
    CREATE TABLE public.applications(id uuid PRIMARY KEY, agency_id uuid, company_owner_id uuid, assigned_expert_id uuid, application_name text, state text);
    CREATE TABLE public.conversations(id uuid PRIMARY KEY, application_id uuid, last_message_at timestamptz);
    CREATE TABLE public.messages(id uuid PRIMARY KEY, conversation_id uuid, sender_id uuid, is_read uuid[]);
    CREATE TABLE public.notifications(id uuid PRIMARY KEY, user_id uuid, title text, message text, type text, is_read boolean, created_at timestamptz, action_url text);
    CREATE TABLE public.audit_log(id uuid DEFAULT gen_random_uuid(), agency_id uuid, table_name text, record_id uuid, action text, performed_by_user_id uuid, details jsonb);
  `)
}, 60000)

beforeEach(async () => {
  executor = db
  failAudit = false
  await db.exec('TRUNCATE public.audit_log, public.notifications, public.messages, public.conversations, public.applications, public.user_agency_roles, public.user_profiles')
  await db.query(`
    INSERT INTO public.user_profiles VALUES
      ($1, 'admin', NULL, true), ($2, 'company_owner', $6, true),
      ($3, 'expert', NULL, true), ($4, 'staff_member', $6, true),
      ($5, 'company_owner', $7, true)
  `, [ADMIN, OWNER, EXPERT, STAFF, OTHER, AGENCY, OTHER_AGENCY])
  await db.query(`
    INSERT INTO public.user_agency_roles VALUES
      ($1, $4, 'company_owner', 'active'), ($2, $4, 'staff_member', 'active'),
      ($3, $5, 'company_owner', 'active')
  `, [OWNER, STAFF, OTHER, AGENCY, OTHER_AGENCY])
  await db.query(`
    INSERT INTO public.applications VALUES
      ($1, $4, $5, NULL, 'Owner application', 'CA'),
      ($2, $6, $7, NULL, 'Other application', 'TX'),
      ($3, $6, $7, $8, 'Expert application', 'NV')
  `, [OWN_APP, OTHER_APP, EXPERT_APP, AGENCY, OWNER, OTHER_AGENCY, OTHER, EXPERT])
  await db.query(`
    INSERT INTO public.conversations VALUES
      ($1, $4, '2026-09-30T10:00:00Z'),
      ($2, $5, '2026-09-30T11:00:00Z'),
      ($3, $6, '2026-09-30T12:00:00Z')
  `, [OWN_CONVERSATION, OTHER_CONVERSATION, EXPERT_CONVERSATION, OWN_APP, OTHER_APP, EXPERT_APP])
  await db.query(`
    INSERT INTO public.messages VALUES
      ($1, $7, $8, NULL),
      ($2, $7, $8, ARRAY[]::uuid[]),
      ($3, $7, $8, ARRAY[$9]::uuid[]),
      ($4, $7, $9, ARRAY[]::uuid[]),
      ($5, $10, $8, ARRAY[]::uuid[]),
      ($6, $11, $8, ARRAY[]::uuid[])
  `, [id(40), id(41), id(42), id(43), id(44), id(45), OWN_CONVERSATION, ADMIN, OWNER, OTHER_CONVERSATION, EXPERT_CONVERSATION])
  await db.query(`
    INSERT INTO public.notifications VALUES
      ($1, $6, 'Document approved', 'Synthetic notice', 'general', false, '2026-09-30T13:00:00Z', '/owner'),
      ($2, $6, 'Visit assignment approved', NULL, 'schedule', false, '2026-09-30T12:00:00Z', NULL),
      ($3, $6, 'New Message', NULL, 'general', false, '2026-09-30T11:00:00Z', NULL),
      ($4, $6, 'Already read', NULL, 'general', true, '2026-09-30T10:00:00Z', NULL),
      ($5, $7, 'Foreign notice', NULL, 'general', false, '2026-09-30T14:00:00Z', NULL),
      ($8, $9, 'Staff notice', NULL, 'general', false, '2026-09-30T15:00:00Z', NULL)
  `, [id(50), id(51), id(52), id(53), id(54), OWNER, OTHER, id(55), STAFF])
  login(OWNER, 'company_owner', AGENCY)
})

afterAll(async () => { await db?.close() })

test('returns one exact badge snapshot scoped to the active agency membership', async () => {
  expect(await readNotificationBadgeSnapshot()).toEqual({
    data: { unreadCount: 4, role: 'company_owner' },
    error: null,
  })
})

test('returns the dropdown list and one content-read audit without cross-agency rows', async () => {
  const result = await readNotificationDropdownSnapshot()
  expect(result.error).toBeNull()
  expect(result.data?.unreadCount).toBe(4)
  expect(result.data?.applications).toEqual([expect.objectContaining({
    application_id: OWN_APP,
    application_name: 'Owner application',
    unread_count: 2,
  })])
  expect(result.data?.notifications.map(item => item.title)).toEqual([
    'Document approved',
    'Visit assignment approved',
  ])
  expect(result.data?.notifications[0].created_at).toBe('2026-09-30T13:00:00.000Z')

  const audit = await db.query<{ details: { operation: string; application_ids: string[]; notification_ids: string[] } }>(
    `SELECT details FROM public.audit_log WHERE performed_by_user_id=$1`, [OWNER]
  )
  expect(audit.rows).toHaveLength(1)
  expect(audit.rows[0].details.operation).toBe('read_notification_dropdown')
  expect(audit.rows[0].details.application_ids).toEqual([OWN_APP])
  expect(JSON.stringify(audit.rows[0].details)).not.toContain('Synthetic notice')
})

test('uses role-specific message scope while staff receive only their own notifications', async () => {
  login(EXPERT, 'expert', null)
  expect((await readNotificationBadgeSnapshot()).data?.unreadCount).toBe(1)
  expect((await readNotificationDropdownSnapshot()).data?.applications[0].application_id).toBe(EXPERT_APP)

  login(STAFF, 'staff_member', AGENCY)
  expect(await readNotificationBadgeSnapshot()).toEqual({
    data: { unreadCount: 1, role: 'staff_member' },
    error: null,
  })
})

test('fails closed for missing sessions, inactive memberships, and failed content-read audits', async () => {
  jest.mocked(getSession).mockResolvedValue(null)
  expect((await readNotificationBadgeSnapshot()).error?.message).toBe('Unauthorized')

  login(OWNER, 'company_owner', AGENCY)
  await db.query(`UPDATE public.user_agency_roles SET status='inactive' WHERE user_id=$1`, [OWNER])
  expect((await readNotificationBadgeSnapshot()).error?.message).toBe('Forbidden')

  await db.query(`UPDATE public.user_agency_roles SET status='active' WHERE user_id=$1`, [OWNER])
  failAudit = true
  expect(await readNotificationDropdownSnapshot()).toEqual({
    data: null,
    error: { message: 'Unable to load notifications.' },
  })
})
