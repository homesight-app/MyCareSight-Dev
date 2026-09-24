import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import sql from '@/db'
import type { AgencyRole, UserRole } from '@/types/auth'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

const SESSION_MAX_AGE_SECONDS = 60 * 60
const LOGIN_WINDOW_MINUTES = 15
const LOGIN_ACCOUNT_LIMIT = 5
const LOGIN_IP_LIMIT = 20
const RESET_WINDOW_MINUTES = 60
const RESET_ACCOUNT_LIMIT = 3
const RESET_IP_LIMIT = 10
let dummyPasswordHash: Promise<string> | null = null

type IdentityRow = {
  id: string
  email: string
  role: UserRole
  agency_id: string | null
  full_name: string | null
  password_hash: string | null
  is_active: boolean
}

export type OpaqueSessionIdentity = {
  sessionToken: string
  userId: string
  email: string
  role: UserRole
  agencyId: string | null
  fullName: string | null
  expiresAt: Date
}

export type CurrentIdentity = {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  agency_id: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
  agencyRoles: AgencyRole[]
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function authFingerprint(value: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is required for authentication')
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isAgencyRole(role: UserRole): boolean {
  return role === 'company_owner' || role === 'care_coordinator' || role === 'staff_member'
}

function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword(randomBytes(32).toString('hex'))
  return dummyPasswordHash
}

async function isRateLimited(
  scope: 'login_account' | 'login_ip' | 'reset_account' | 'reset_ip',
  subject: string,
  windowMinutes: number,
  limit: number
): Promise<boolean> {
  const subjectHash = authFingerprint(`${scope}:${subject}`)
  const failuresOnly = scope === 'login_account' || scope === 'login_ip'
  const [row] = await sql<{ attempts: number }[]>`
    SELECT count(*)::int AS attempts
    FROM auth_rate_limit_events
    WHERE scope = ${scope}
      AND subject_hash = ${subjectHash}
      AND (${failuresOnly} = false OR succeeded = false)
      AND created_at >= now() - (${windowMinutes} * interval '1 minute')
  `
  return (row?.attempts ?? 0) >= limit
}

async function recordRateEvent(
  scope: 'login_account' | 'login_ip' | 'reset_account' | 'reset_ip',
  subject: string,
  succeeded: boolean
): Promise<void> {
  const subjectHash = authFingerprint(`${scope}:${subject}`)
  await sql`
    INSERT INTO auth_rate_limit_events (scope, subject_hash, succeeded)
    VALUES (${scope}, ${subjectHash}, ${succeeded})
  `
}

export async function authenticateCredentials(input: {
  email: string
  password: string
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<OpaqueSessionIdentity | null> {
  const email = normalizeEmail(input.email)
  const ipAddress = input.ipAddress?.trim() || null

  if (await isRateLimited('login_account', email, LOGIN_WINDOW_MINUTES, LOGIN_ACCOUNT_LIMIT)) {
    return null
  }
  if (ipAddress && await isRateLimited('login_ip', ipAddress, LOGIN_WINDOW_MINUTES, LOGIN_IP_LIMIT)) {
    return null
  }

  const [profile] = await sql<IdentityRow[]>`
    SELECT id, email, role, agency_id, full_name, password_hash, is_active
    FROM user_profiles
    WHERE lower(email) = ${email}
    LIMIT 1
  `

  const storedHash = profile?.password_hash ?? await getDummyPasswordHash()
  const verifiedPassword = await verifyPassword(input.password, storedHash)
  const passwordResult = profile?.password_hash
    ? verifiedPassword
    : { valid: false, needsRehash: false }
  const valid = Boolean(profile?.is_active && passwordResult.valid)

  await recordRateEvent('login_account', email, valid)
  if (ipAddress) await recordRateEvent('login_ip', ipAddress, valid)
  if (!valid || !profile) return null

  if (isAgencyRole(profile.role)) {
    const [membership] = await sql<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM user_agency_roles
        WHERE user_id = ${profile.id}
          AND agency_id = ${profile.agency_id}
          AND role = ${profile.role}
          AND status = 'active'
      ) AS present
    `
    if (!membership?.present) return null
  }

  if (passwordResult.needsRehash) {
    const upgradedHash = await hashPassword(input.password)
    await sql`
      UPDATE user_profiles
      SET password_hash = ${upgradedHash}, updated_at = now()
      WHERE id = ${profile.id}
    `
  }

  const sessionToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  await sql`
    INSERT INTO auth_sessions (
      user_id, token_hash, expires_at, created_ip_hash, user_agent_hash
    ) VALUES (
      ${profile.id},
      ${sha256(sessionToken)},
      ${expiresAt.toISOString()},
      ${ipAddress ? authFingerprint(`ip:${ipAddress}`) : null},
      ${input.userAgent ? authFingerprint(`ua:${input.userAgent}`) : null}
    )
  `
  await sql`
    UPDATE user_profiles SET last_login_at = now() WHERE id = ${profile.id}
  `
  await sql`
    INSERT INTO audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
    VALUES (${profile.agency_id}, 'auth_sessions', ${profile.id}, 'LOGIN', ${profile.id},
      ${sql.json({ method: 'credentials' })})
  `

  return {
    sessionToken,
    userId: profile.id,
    email: profile.email,
    role: profile.role,
    agencyId: profile.agency_id,
    fullName: profile.full_name,
    expiresAt,
  }
}

export async function readOpaqueSession(sessionToken: string): Promise<OpaqueSessionIdentity | null> {
  if (!sessionToken) return null
  const [row] = await sql<{
    user_id: string
    email: string
    role: UserRole
    agency_id: string | null
    full_name: string | null
    expires_at: Date
    membership_active: boolean
  }[]>`
    SELECT
      session.user_id,
      profile.email,
      profile.role,
      profile.agency_id,
      profile.full_name,
      session.expires_at,
      CASE
        WHEN profile.role IN ('admin', 'expert') THEN true
        ELSE EXISTS (
          SELECT 1 FROM user_agency_roles membership
          WHERE membership.user_id = profile.id
            AND membership.agency_id = profile.agency_id
            AND membership.role = profile.role
            AND membership.status = 'active'
        )
      END AS membership_active
    FROM auth_sessions session
    JOIN user_profiles profile ON profile.id = session.user_id
    WHERE session.token_hash = ${sha256(sessionToken)}
      AND session.revoked_at IS NULL
      AND session.expires_at > now()
      AND profile.is_active = true
    LIMIT 1
  `
  if (!row?.membership_active) return null

  await sql`
    UPDATE auth_sessions
    SET last_seen_at = now()
    WHERE token_hash = ${sha256(sessionToken)}
      AND last_seen_at < now() - interval '5 minutes'
  `

  return {
    sessionToken,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    agencyId: row.agency_id,
    fullName: row.full_name,
    expiresAt: new Date(row.expires_at),
  }
}

export async function revokeOpaqueSession(sessionToken: string, reason = 'sign_out'): Promise<void> {
  if (!sessionToken) return
  await sql`
    UPDATE auth_sessions
    SET revoked_at = COALESCE(revoked_at, now()),
        revoke_reason = COALESCE(revoke_reason, ${reason})
    WHERE token_hash = ${sha256(sessionToken)}
  `
}

export async function readCurrentIdentity(userId: string): Promise<CurrentIdentity | null> {
  const [profile] = await sql<Omit<CurrentIdentity, 'agencyRoles'>[]>`
    SELECT id, email, role, full_name, agency_id, is_active,
      last_login_at, created_at, updated_at
    FROM user_profiles
    WHERE id = ${userId} AND is_active = true
    LIMIT 1
  `
  if (!profile) return null

  const memberships = await sql<{ agency_id: string; role: AgencyRole['role']; status: string }[]>`
    SELECT agency_id, role, status
    FROM user_agency_roles
    WHERE user_id = ${userId}
      AND status IN ('active', 'invited', 'pending')
  `
  const agencyRoles: AgencyRole[] = memberships.map(membership => ({
    agency_id: membership.agency_id,
    role: membership.role,
    status: membership.status,
  }))

  if (isAgencyRole(profile.role)) {
    const activeMembership = agencyRoles.some(membership =>
      membership.status === 'active'
      && membership.agency_id === profile.agency_id
      && membership.role === profile.role
    )
    if (!activeMembership) return null
  }

  return { ...profile, agencyRoles }
}

export async function createPasswordReset(input: {
  email: string
  ipAddress?: string | null
}): Promise<{ token: string; email: string } | null> {
  const email = normalizeEmail(input.email)
  const ipAddress = input.ipAddress?.trim() || null
  if (await isRateLimited('reset_account', email, RESET_WINDOW_MINUTES, RESET_ACCOUNT_LIMIT)) return null
  if (ipAddress && await isRateLimited('reset_ip', ipAddress, RESET_WINDOW_MINUTES, RESET_IP_LIMIT)) return null

  const [profile] = await sql<{ id: string; email: string; is_active: boolean }[]>`
    SELECT id, email, is_active FROM user_profiles WHERE lower(email) = ${email} LIMIT 1
  `
  await recordRateEvent('reset_account', email, Boolean(profile?.is_active))
  if (ipAddress) await recordRateEvent('reset_ip', ipAddress, Boolean(profile?.is_active))
  if (!profile?.is_active) return null

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  await sql.begin(async tx => {
    await tx`
      UPDATE password_reset_tokens SET used_at = now()
      WHERE user_id = ${profile.id} AND used_at IS NULL
    `
    await tx`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, request_ip_hash)
      VALUES (
        ${profile.id}, ${sha256(token)}, ${expiresAt.toISOString()},
        ${ipAddress ? authFingerprint(`ip:${ipAddress}`) : null}
      )
    `
    await tx`
      INSERT INTO audit_log (table_name, record_id, action, performed_by_user_id, details)
      VALUES ('password_reset_tokens', ${profile.id}, 'REQUEST', NULL,
        ${tx.json({ expires_in_minutes: 60 })})
    `
  })
  return { token, email: profile.email }
}

export async function consumePasswordResetToken(token: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword)
  return sql.begin(async tx => {
    const [reset] = await tx<{ id: string; user_id: string }[]>`
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = ${sha256(token)}
        AND used_at IS NULL
        AND expires_at > now()
      FOR UPDATE
    `
    if (!reset) return false

    await tx`
      UPDATE password_reset_tokens SET used_at = now() WHERE id = ${reset.id}
    `
    await tx`
      UPDATE user_profiles
      SET password_hash = ${passwordHash}, invite_token = NULL,
          invite_token_expires_at = NULL, updated_at = now()
      WHERE id = ${reset.user_id}
    `
    await tx`
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, now()),
          revoke_reason = COALESCE(revoke_reason, 'password_reset')
      WHERE user_id = ${reset.user_id} AND revoked_at IS NULL
    `
    await tx`
      INSERT INTO audit_log (table_name, record_id, action, performed_by_user_id, details)
      VALUES ('user_profiles', ${reset.user_id}, 'PASSWORD_RESET', ${reset.user_id}, '{}'::jsonb)
    `
    return true
  })
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword)
  await sql`
    UPDATE user_profiles SET password_hash = ${passwordHash}, updated_at = now()
    WHERE id = ${userId}
  `
}
