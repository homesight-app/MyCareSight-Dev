/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import {
  rpcGetTotalUnreadCountForUser,
  getTotalMessageCountForUser,
  rpcCountUnreadMessagesForUser,
  rpcAdminUnreadMessageCountsByClient,
  rpcGetUnreadMessagesForUserInConversations,
  rpcMarkMessagesAsReadByUser,
  rpcMarkMessageAsReadByUser,
  markConversationMessagesAsReadExceptSender,
} from '@/lib/repositories/message-read-state'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

let mockDb: PGlite
let mockExecutor: Pick<PGlite, 'query'>
let mockFailAudit = false

// Execute the production repository's parameterized SQL in local PostgreSQL.
// Only the connection/transaction transport and session are substituted.
jest.mock('@/db', () => {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
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
        if (mockFailAudit && query.includes('INSERT INTO public.audit_log')) {
          return Promise.reject(new Error('synthetic audit outage')).then(resolve, reject)
        }
        return mockExecutor.query(query, params).then(result => result.rows).then(resolve, reject)
      },
    }
    return fragment
  }
  return {
    __esModule: true,
    default: tag,
    withUserContext: async (_id: string, _role: string, _agency: string | null, fn: () => Promise<unknown>) =>
      mockDb.transaction(async tx => {
        mockExecutor = tx
        try { return await fn() } finally { mockExecutor = mockDb }
      }),
  }
})

const id = (n: number) => '00000000-0000-4000-8000-' + n.toString().padStart(12, '0')
const ADMIN = id(1), OWNER = id(2), OTHER = id(3), EXPERT = id(4), AGENCY = id(10), OTHER_AGENCY = id(11)
const CONV = id(20), OTHER_CONV = id(21)
const M_NULL = id(30), M_EMPTY = id(31), M_OTHER_READ = id(32), M_READ = id(33), M_OWN = id(34), M_FOREIGN = id(35)

function login(userId = OWNER) {
  jest.mocked(getSession).mockResolvedValue({ user: { id: userId } } as Awaited<ReturnType<typeof getSession>>)
}

beforeAll(async () => {
  mockDb = new PGlite()
  mockExecutor = mockDb
  await mockDb.exec(`
    CREATE TABLE public.user_profiles(id uuid PRIMARY KEY, role text, agency_id uuid, is_active boolean);
    CREATE TABLE public.applications(id uuid PRIMARY KEY, agency_id uuid, company_owner_id uuid);
    CREATE TABLE public.conversations(id uuid PRIMARY KEY, application_id uuid, client_id uuid);
    CREATE TABLE public.user_agency_roles(id uuid DEFAULT gen_random_uuid(), user_id uuid, agency_id uuid, role text, status text);
    CREATE TABLE public.messages(id uuid PRIMARY KEY, conversation_id uuid, sender_id uuid, content text, created_at timestamptz DEFAULT now(), is_read uuid[]);
    CREATE TABLE public.audit_log(id uuid DEFAULT gen_random_uuid(), table_name text, record_id uuid, action text, performed_by_user_id uuid, details jsonb);
  `)
}, 60000)

beforeEach(async () => {
  mockFailAudit = false
  mockExecutor = mockDb
  await mockDb.exec('TRUNCATE public.audit_log, public.messages, public.conversations, public.applications, public.user_agency_roles, public.user_profiles')
  await mockDb.query(`
    INSERT INTO public.user_profiles VALUES
    ($1, 'admin', NULL, true), ($2, 'company_owner', $5, true),
    ($3, 'company_owner', $6, true), ($4, 'expert', NULL, true)
  `, [ADMIN, OWNER, OTHER, EXPERT, AGENCY, OTHER_AGENCY])
  await mockDb.query(`INSERT INTO public.applications VALUES ($1,$3,$5),($2,$4,$6)`,
    [id(40), id(41), AGENCY, OTHER_AGENCY, OWNER, OTHER])
  await mockDb.query(`INSERT INTO public.conversations VALUES ($1,$3,$5),($2,$4,$6)`,
    [CONV, OTHER_CONV, id(40), id(41), OWNER, OTHER])
  await mockDb.query(`
    INSERT INTO public.user_agency_roles(user_id,agency_id,role,status)
    VALUES ($1,$3,'company_owner','active'),($2,$4,'company_owner','active')
  `, [OWNER, OTHER, AGENCY, OTHER_AGENCY])
  const messages = [
    [M_NULL, CONV, ADMIN, null],
    [M_EMPTY, CONV, ADMIN, []],
    [M_OTHER_READ, CONV, ADMIN, [OTHER]],
    [M_READ, CONV, ADMIN, [OWNER]],
    [M_OWN, CONV, OWNER, []],
    [M_FOREIGN, OTHER_CONV, ADMIN, []],
  ]
  for (const [messageId, conversationId, senderId, readers] of messages) {
    await mockDb.query(`INSERT INTO public.messages(id,conversation_id,sender_id,content,is_read) VALUES ($1,$2,$3,'SYNTHETIC TEST MESSAGE',$4)`,
      [messageId, conversationId, senderId, readers])
  }
  login()
})

afterAll(async () => { await mockDb?.close() })

test('counts NULL/empty/other-reader arrays, excludes own and already-read messages, and returns a scalar', async () => {
  const result = await rpcGetTotalUnreadCountForUser([CONV, OTHER_CONV], OWNER)
  expect(result).toEqual({ data: 3, error: null })
  expect(await getTotalMessageCountForUser([CONV, OTHER_CONV], OWNER)).toEqual({ data: 5, error: null })
  expect(await rpcCountUnreadMessagesForUser([CONV, OTHER_CONV], OWNER)).toEqual({
    data: [{ conversation_id: CONV, unread_count: 3 }], error: null,
  })
})

test.each(['invited', 'pending', 'inactive'])('denies %s membership even when profile and owner IDs match', async status => {
  await mockDb.query('UPDATE public.user_agency_roles SET status=$1 WHERE user_id=$2', [status, OWNER])
  expect((await rpcGetTotalUnreadCountForUser([CONV], OWNER)).data).toBe(0)
  expect((await getTotalMessageCountForUser([CONV], OWNER)).data).toBe(0)
  expect((await rpcGetUnreadMessagesForUserInConversations([CONV], OWNER)).data).toEqual([])
})

test('rejects a forged reader, missing session, and deactivated Neon account', async () => {
  expect((await rpcGetTotalUnreadCountForUser([CONV], OTHER)).error?.message).toBe('Forbidden')
  jest.mocked(getSession).mockResolvedValue(null)
  expect((await rpcMarkMessageAsReadByUser(M_NULL, OWNER)).error?.message).toBe('Unauthorized')
  login()
  await mockDb.query('UPDATE public.user_profiles SET is_active=false WHERE id=$1', [OWNER])
  expect((await rpcGetTotalUnreadCountForUser([CONV], OWNER)).error?.message).toBe('Forbidden')
})

test('platform admin and expert access follows the source platform-staff policy', async () => {
  login(EXPERT)
  expect((await rpcGetTotalUnreadCountForUser([CONV, OTHER_CONV], EXPERT)).data).toBe(6)
  login(ADMIN)
  expect((await rpcGetTotalUnreadCountForUser([CONV, OTHER_CONV], ADMIN)).data).toBe(1)
})

test('admin client counts exclude self-sent messages and respect an empty filter', async () => {
  expect((await rpcAdminUnreadMessageCountsByClient(OWNER)).error?.message).toBe('Forbidden')
  login(ADMIN)
  expect((await rpcAdminUnreadMessageCountsByClient(ADMIN, [OWNER])).data).toEqual([{ client_id: OWNER, unread_count: 1 }])
  expect((await rpcAdminUnreadMessageCountsByClient(ADMIN, [])).data).toEqual([])
})

test('unread message reads are scoped and capped', async () => {
  const result = await rpcGetUnreadMessagesForUserInConversations([CONV, OTHER_CONV], OWNER, 2)
  expect(result.error).toBeNull()
  expect(result.data).toHaveLength(2)
  expect(result.data?.every(row => row.conversation_id === CONV)).toBe(true)
})

test('rejects malformed IDs, oversized batches, and excessive row limits', async () => {
  expect((await rpcGetTotalUnreadCountForUser(['invalid'], OWNER)).error).not.toBeNull()
  expect((await rpcGetTotalUnreadCountForUser(Array(5001).fill(CONV), OWNER)).error).not.toBeNull()
  expect((await rpcGetUnreadMessagesForUserInConversations([CONV], OWNER, 5001)).error).not.toBeNull()
})

test('empty input returns zero or no rows without widening access', async () => {
  expect((await rpcGetTotalUnreadCountForUser([], OWNER)).data).toBe(0)
  expect((await rpcCountUnreadMessagesForUser([], OWNER)).data).toEqual([])
  expect((await rpcGetUnreadMessagesForUserInConversations([], OWNER)).data).toEqual([])
})

test('mark-read preserves other readers, is idempotent, and excludes foreign conversations', async () => {
  const ids = [M_NULL, M_EMPTY, M_OTHER_READ, M_READ, M_OWN, M_FOREIGN]
  expect((await rpcMarkMessagesAsReadByUser(ids, OWNER)).error).toBeNull()
  expect((await rpcMarkMessagesAsReadByUser(ids, OWNER)).error).toBeNull()
  const result = await mockDb.query<{ id: string; is_read: string[] }>('SELECT id,is_read FROM public.messages ORDER BY id')
  const rows = new Map(result.rows.map(row => [row.id, row.is_read]))
  expect(rows.get(M_NULL)).toEqual([OWNER])
  expect(rows.get(M_OTHER_READ)).toEqual([OTHER, OWNER])
  expect(rows.get(M_READ)).toEqual([OWNER])
  expect(rows.get(M_OWN)).toEqual([])
  expect(rows.get(M_FOREIGN)).toEqual([])
})

test('conversation mark-read appends a UUID instead of assigning a boolean', async () => {
  expect((await markConversationMessagesAsReadExceptSender(CONV, OWNER)).error).toBeNull()
  expect((await rpcGetTotalUnreadCountForUser([CONV], OWNER)).data).toBe(0)
  const foreign = await mockDb.query<{ is_read: string[] }>('SELECT is_read FROM public.messages WHERE id=$1', [M_FOREIGN])
  expect(foreign.rows[0].is_read).toEqual([])
})

test('a failed audit insert rolls back the read-state mutation and exposes no database details', async () => {
  mockFailAudit = true
  expect(await rpcMarkMessageAsReadByUser(M_NULL, OWNER)).toEqual({ data: null, error: { message: 'Message operation failed' } })
  const result = await mockDb.query<{ is_read: string[] | null }>('SELECT is_read FROM public.messages WHERE id=$1', [M_NULL])
  expect(result.rows[0].is_read).toBeNull()
})

test('audit evidence records actor/resource identifiers without message content', async () => {
  await rpcGetUnreadMessagesForUserInConversations([CONV], OWNER)
  const result = await mockDb.query<{ performed_by_user_id: string; details: unknown }>('SELECT performed_by_user_id,details FROM public.audit_log')
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0].performed_by_user_id).toBe(OWNER)
  expect(JSON.stringify(result.rows[0].details)).not.toContain('SYNTHETIC TEST MESSAGE')
  expect(JSON.stringify(result.rows[0].details)).toContain(M_NULL)
})


test('the optional index migration is repeatable and rejects conflicting definitions atomically', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const migration = readFileSync(join(process.cwd(), 'scripts/migrations/001-message-read-state-indexes.sql'), 'utf8')
  await mockDb.exec(migration)
  await mockDb.exec(migration)
  const indexes = await mockDb.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM pg_indexes WHERE indexname IN ('idx_user_agency_roles_active_message_scope','idx_conversations_application_id','idx_conversations_client_id')`)
  expect(indexes.rows[0].count).toBe(3)

  // Deliberately corrupt only the disposable local test database.
  await mockDb.exec(`
    DROP INDEX idx_user_agency_roles_active_message_scope;
    DROP INDEX idx_conversations_application_id;
    DROP INDEX idx_conversations_client_id;
    CREATE INDEX idx_user_agency_roles_active_message_scope ON public.user_agency_roles(role);
  `)
  await expect(mockDb.exec(migration)).rejects.toThrow('001 index definition mismatch')
  await mockDb.exec('ROLLBACK')
  const rolledBack = await mockDb.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM pg_indexes WHERE indexname IN ('idx_conversations_application_id','idx_conversations_client_id')`)
  expect(rolledBack.rows[0].count).toBe(0)
})
