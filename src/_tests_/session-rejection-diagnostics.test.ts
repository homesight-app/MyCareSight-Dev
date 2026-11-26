/** @jest-environment node */
import { createHash, createHmac } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { authenticateCredentials, readOpaqueSession, recordOpaqueSessionActivity, revokeOpaqueSession } from '@/lib/repositories/auth-identity'
import { verifyPassword } from '@/lib/auth/password'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth/password', () => ({ hashPassword: jest.fn(), verifyPassword: jest.fn() }))
let db: PGlite
let failDiagnostic = false
let failTelemetry = false
let revokeBeforeActivity = false
let initialReadFailures = 0
let failSessionInsert = false
let loginRateReads = 0
let warning: jest.SpyInstance
const priorSecret = process.env.AUTH_SECRET
jest.mock('@/db', () => ({ __esModule: true, default: Object.assign((parts: TemplateStringsArray, ...values: unknown[]) => {
  const query = parts.reduce((text, part, index) => text + part + (index < values.length ? '$' + (index + 1) : ''), '')
  if (query.includes('FROM auth_rate_limit_events')) {
    loginRateReads++
    if (initialReadFailures-- > 0) return Promise.reject(new AggregateError([Object.assign(new Error('private connect failure'), { code: 'ETIMEDOUT' })]))
  }
  if (failSessionInsert && query.includes('INSERT INTO auth_sessions')) return Promise.reject(Object.assign(new Error('private write failure'), { code: 'ECONNRESET' }))
  if ((failDiagnostic && query.includes('FROM (SELECT 1) anchor')) || (failTelemetry && query.includes('UPDATE auth_sessions'))) {
    return Promise.reject(new Error('synthetic-private-provider-error'))
  }
  if (revokeBeforeActivity && query.includes('UPDATE auth_sessions SET last_seen_at')) {
    return db.exec('UPDATE auth_sessions SET revoked_at=now()').then(() => db.query(query, values)).then(result => result.rows)
  }
  return db.query(query, values).then(result => result.rows)
}, { json: JSON.stringify }) }))

const userId = '10000000-0000-4000-8000-000000000001'
const agencyId = '20000000-0000-4000-8000-000000000001'
const token = 'synthetic-opaque-token'
const tokenHash = createHash('sha256').update(token).digest('hex')

beforeAll(async () => {
  process.env.AUTH_SECRET = 'synthetic-session-policy-test-secret'
  db = new PGlite()
  await db.exec(`
    CREATE TABLE user_profiles(id uuid PRIMARY KEY, email text, role text, agency_id uuid, full_name text, is_active boolean, password_hash text DEFAULT 'synthetic', last_login_at timestamptz);
    CREATE TABLE user_agency_roles(user_id uuid, agency_id uuid, role text, status text);
    CREATE TABLE auth_sessions(user_id uuid, token_hash text UNIQUE, expires_at timestamptz, revoked_at timestamptz, last_seen_at timestamptz DEFAULT now(), created_ip_hash text, user_agent_hash text, revoke_reason text);
    CREATE TABLE auth_rate_limit_events(scope text, subject_hash text, succeeded boolean, created_at timestamptz DEFAULT now());
    CREATE TABLE audit_log(agency_id uuid, table_name text, record_id uuid, action text, performed_by_user_id uuid, details jsonb);
  `)
}, 60000)
beforeEach(async () => {
  failDiagnostic = false; failTelemetry = false
  revokeBeforeActivity = false
  initialReadFailures = 0; failSessionInsert = false; loginRateReads = 0
  warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
  await db.exec('TRUNCATE auth_sessions, user_profiles, user_agency_roles, auth_rate_limit_events, audit_log')
  await db.query(`INSERT INTO user_profiles(id,email,role,agency_id,full_name,is_active) VALUES($1,'synthetic@example.test','admin',NULL,'Synthetic',true)`, [userId])
  await db.query(`INSERT INTO auth_sessions(user_id,token_hash,expires_at,revoked_at,last_seen_at) VALUES($1,$2,now()+interval '1 hour',NULL,now()-interval '10 minutes')`, [userId, tokenHash])
})
afterEach(() => { warning.mockRestore() })
afterAll(async () => {
  await db.close()
  if (priorSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = priorSecret
})

test('valid sessions still authenticate without rejection logs', async () => {
  expect(await readOpaqueSession(token)).toMatchObject({ userId, sessionToken: token })
  expect(warning).not.toHaveBeenCalled()
})

test.each([
  ['not-found', 'DELETE FROM auth_sessions'],
  ['revoked', 'UPDATE auth_sessions SET revoked_at=now()'],
  ['expired', "UPDATE auth_sessions SET expires_at=now()-interval '1 minute'"],
  ['idle-expired', "UPDATE auth_sessions SET last_seen_at=now()-interval '20 minutes'"],
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

test('ordinary reads never write activity, even when writes would fail', async () => {
  failTelemetry = true
  const before = await db.query('SELECT last_seen_at FROM auth_sessions')
  expect(await readOpaqueSession(token)).toMatchObject({ userId })
  expect(await db.query('SELECT last_seen_at FROM auth_sessions')).toEqual(before)
  expect(warning).not.toHaveBeenCalled()
})

test('explicit activity extends idle expiry but preserves the absolute cap', async () => {
  const before = await readOpaqueSession(token)
  const after = await recordOpaqueSessionActivity(token)
  expect(after!.expiresAt.getTime()).toBeGreaterThan(before!.expiresAt.getTime() + 9 * 60000)
  expect(after!.absoluteExpiresAt).toEqual(before!.absoluteExpiresAt)
  await db.exec("UPDATE auth_sessions SET expires_at=now()+interval '2 minutes'")
  const capped = await recordOpaqueSessionActivity(token)
  expect(capped!.expiresAt).toEqual(capped!.absoluteExpiresAt)
})

test.each([
  "UPDATE auth_sessions SET last_seen_at=now()-interval '21 minutes'",
  "UPDATE auth_sessions SET expires_at=now()-interval '1 second'",
  'UPDATE auth_sessions SET revoked_at=now()',
  'UPDATE user_profiles SET is_active=false',
])('activity cannot resurrect an invalid session: %s', async change => {
  await db.exec(change)
  const before = await db.query('SELECT last_seen_at FROM auth_sessions')
  expect(await recordOpaqueSessionActivity(token)).toBeNull()
  expect(await db.query('SELECT last_seen_at FROM auth_sessions')).toEqual(before)
})

test('activity write failure propagates rather than claiming a renewal', async () => {
  failTelemetry = true
  await expect(recordOpaqueSessionActivity(token)).rejects.toThrow('synthetic-private-provider-error')
})

test('new credentials sessions have an eight-hour fixed cap and a twenty-minute effective idle deadline', async () => {
  jest.mocked(verifyPassword).mockResolvedValue({ valid: true, needsRehash: false })
  const before = Date.now()
  const identity = await authenticateCredentials({ email: 'synthetic@example.test', password: 'synthetic-only' })
  expect(identity!.expiresAt.getTime() - before).toBeGreaterThanOrEqual(8 * 60 * 60 * 1000)
  expect(identity!.expiresAt.getTime() - before).toBeLessThan(8 * 60 * 60 * 1000 + 5000)
  const confirmed = await readOpaqueSession(identity!.sessionToken)
  expect(confirmed!.expiresAt.getTime() - before).toBeGreaterThan(19 * 60 * 1000)
  expect(confirmed!.expiresAt.getTime() - before).toBeLessThan(21 * 60 * 1000)
  expect(confirmed!.absoluteExpiresAt).toEqual(identity!.expiresAt)
})

test('initial connection retry checks the password and writes the session, rate event and audit only once', async () => {
  initialReadFailures = 1
  jest.mocked(verifyPassword).mockClear().mockResolvedValue({ valid: true, needsRehash: false })
  const identity = await authenticateCredentials({ email: 'synthetic@example.test', password: 'synthetic-only' })
  expect(identity).not.toBeNull()
  expect(loginRateReads).toBe(2)
  expect(verifyPassword).toHaveBeenCalledTimes(1)
  expect((await db.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0]).toEqual({ n: 2 })
  expect((await db.query('SELECT count(*)::int AS n FROM auth_rate_limit_events')).rows[0]).toEqual({ n: 1 })
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='LOGIN'")).rows[0]).toEqual({ n: 1 })
})

test('retry does not bypass the account rate limit', async () => {
  initialReadFailures = 1
  const subject = createHmac('sha256', process.env.AUTH_SECRET!).update('login_account:synthetic@example.test').digest('hex')
  await db.query("INSERT INTO auth_rate_limit_events SELECT 'login_account',$1,false,now() FROM generate_series(1,5)", [subject])
  jest.mocked(verifyPassword).mockClear()
  expect(await authenticateCredentials({ email: 'synthetic@example.test', password: 'synthetic-only' })).toBeNull()
  expect(loginRateReads).toBe(2)
  expect(verifyPassword).not.toHaveBeenCalled()
})

test('a later authentication write failure never retries the login or session insert', async () => {
  failSessionInsert = true
  jest.mocked(verifyPassword).mockClear().mockResolvedValue({ valid: true, needsRehash: false })
  await expect(authenticateCredentials({ email: 'synthetic@example.test', password: 'synthetic-only' })).rejects.toMatchObject({ code: 'ECONNRESET' })
  expect(loginRateReads).toBe(1)
  expect(verifyPassword).toHaveBeenCalledTimes(1)
  expect((await db.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0]).toEqual({ n: 1 })
})

test('logout and its identifier-only audit commit atomically and duplicate logout adds no audit', async () => {
  await revokeOpaqueSession(token, 'portal_logout')
  await revokeOpaqueSession(token, 'portal_logout')
  expect(await readOpaqueSession(token)).toBeNull()
  const audits = await db.query('SELECT action, details FROM audit_log')
  expect(audits.rows).toEqual([{ action: 'REVOKE', details: { reason: 'portal_logout' } }])
})

test('a revocation committed between validation and activity update is not overwritten', async () => {
  revokeBeforeActivity = true
  expect(await recordOpaqueSessionActivity(token)).toBeNull()
})

test('logout audit failure rolls back revocation', async () => {
  await db.exec("ALTER TABLE audit_log ADD CONSTRAINT synthetic_audit_failure CHECK(action <> 'REVOKE')")
  try {
    await expect(revokeOpaqueSession(token)).rejects.toThrow()
    const result = await db.query('SELECT revoked_at FROM auth_sessions')
    expect(result.rows).toEqual([{ revoked_at: null }])
  } finally {
    await db.exec('ALTER TABLE audit_log DROP CONSTRAINT synthetic_audit_failure')
  }
})
