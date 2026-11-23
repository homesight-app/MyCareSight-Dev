/** @jest-environment node */
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { readOpaqueSession } from '@/lib/repositories/auth-identity'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth/password', () => ({ hashPassword: jest.fn(), verifyPassword: jest.fn() }))
let db: PGlite
let failDiagnostic = false
let failTelemetry = false
let warning: jest.SpyInstance
jest.mock('@/db', () => ({ __esModule: true, default: (parts: TemplateStringsArray, ...values: unknown[]) => {
  const query = parts.reduce((text, part, index) => text + part + (index < values.length ? '$' + (index + 1) : ''), '')
  if ((failDiagnostic && query.includes('FROM (SELECT 1) anchor')) || (failTelemetry && query.includes('UPDATE auth_sessions'))) {
    return Promise.reject(new Error('synthetic-private-provider-error'))
  }
  return db.query(query, values).then(result => result.rows)
} }))

const userId = '10000000-0000-4000-8000-000000000001'
const agencyId = '20000000-0000-4000-8000-000000000001'
const token = 'synthetic-opaque-token'
const tokenHash = createHash('sha256').update(token).digest('hex')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE user_profiles(id uuid PRIMARY KEY, email text, role text, agency_id uuid, full_name text, is_active boolean);
    CREATE TABLE user_agency_roles(user_id uuid, agency_id uuid, role text, status text);
    CREATE TABLE auth_sessions(user_id uuid, token_hash text UNIQUE, expires_at timestamptz, revoked_at timestamptz, last_seen_at timestamptz);
  `)
}, 60000)
beforeEach(async () => {
  failDiagnostic = false; failTelemetry = false
  warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
  await db.exec('TRUNCATE auth_sessions, user_profiles, user_agency_roles')
  await db.query(`INSERT INTO user_profiles VALUES($1,'synthetic@example.test','admin',NULL,'Synthetic',true)`, [userId])
  await db.query(`INSERT INTO auth_sessions VALUES($1,$2,now()+interval '1 hour',NULL,now()-interval '10 minutes')`, [userId, tokenHash])
})
afterEach(() => { warning.mockRestore() })
afterAll(async () => { await db.close() })

test('valid sessions still authenticate without rejection logs', async () => {
  expect(await readOpaqueSession(token)).toMatchObject({ userId, sessionToken: token })
  expect(warning).not.toHaveBeenCalled()
})

test.each([
  ['not-found', 'DELETE FROM auth_sessions'],
  ['revoked', 'UPDATE auth_sessions SET revoked_at=now()'],
  ['expired', "UPDATE auth_sessions SET expires_at=now()-interval '1 minute'"],
  ['profile-inactive', 'UPDATE user_profiles SET is_active=false'],
  ['profile-unavailable', 'DELETE FROM user_profiles'],
])('keeps %s sessions rejected and logs only the reason enum', async (reason, sql) => {
  await db.exec(sql)
  expect(await readOpaqueSession(token)).toBeNull()
  expect(warning.mock.calls).toEqual([['[auth] Session rejected', { stage: 'opaque-session', reason }]])
})

test('checks current active agency membership on every read', async () => {
  await db.query(`UPDATE user_profiles SET role='care_coordinator',agency_id=$1`, [agencyId])
  expect(await readOpaqueSession(token)).toBeNull()
  expect(warning).toHaveBeenLastCalledWith('[auth] Session rejected', { stage: 'opaque-session', reason: 'membership-inactive' })
  await db.query(`INSERT INTO user_agency_roles VALUES($1,$2,'care_coordinator','active')`, [userId, agencyId])
  expect(await readOpaqueSession(token)).toMatchObject({ userId })
  await db.exec("UPDATE user_agency_roles SET status='inactive'")
  expect(await readOpaqueSession(token)).toBeNull()
})

test('diagnostic failure never authenticates a rejected token or exposes raw errors', async () => {
  await db.exec('DELETE FROM auth_sessions')
  failDiagnostic = true
  expect(await readOpaqueSession(token)).toBeNull()
  expect(warning.mock.calls).toEqual([['[auth] Session rejected', { stage: 'opaque-session', reason: 'unclassified' }]])
})

test('last-seen telemetry failure still cannot sign out a verified session', async () => {
  failTelemetry = true
  expect(await readOpaqueSession(token)).toMatchObject({ userId })
  expect(warning.mock.calls).toEqual([['[auth] Session last-seen update unavailable']])
})
