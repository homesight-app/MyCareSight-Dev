# UAT Auth.js PostgreSQL session foundation

Status: application code and migration 015 prepared locally on 2026-09-23. The user applied 015 to Neon Dev and UAT; independent read-only verification returned `access_pass=true` on both branches. Production remains out of scope.

Local validation: the migration executes in synthetic PostgreSQL and its profile-change trigger revokes the session and writes audit evidence. All 190 tests across 21 suites, TypeScript, focused legacy-config ESLint, and the production build pass. Existing unrelated React Hook and Browserslist warnings remain.

## Architecture

Auth.js remains the authentication framework and the existing Credentials login interface remains in place. Auth.js requires its `jwt` session strategy for Credentials users, so the application supplies custom encode/decode hooks: the browser cookie contains only a random 256-bit opaque token, while PostgreSQL stores its SHA-256 hash, expiry, revocation state, and limited hashed request metadata. No roles, agency IDs, or authorization claims are trusted from the cookie.

The implementation uses standard PostgreSQL tables and `DATABASE_URL`; it does not use Neon Auth or a Neon-specific API. Moving to another managed PostgreSQL provider would require a connection change and migration execution, rather than an authentication rewrite.

## Migration 015

`015-auth-session-foundation.sql` adds:

- `auth_sessions` for one-hour, server-revocable sessions;
- `password_reset_tokens` for single-use reset-token hashes;
- `auth_rate_limit_events` for durable account and IP login/reset limits;
- indexes for active-session, token, rate-window, and expiry lookups; and
- revocation triggers for profile identity/security changes and agency-membership changes.

The tables are unavailable to `PUBLIC` and granted only to the restricted `mycaresight_app` runtime role. The trigger records identifier-only revocation evidence in `audit_log`. The migration refuses Supabase, requires the independent migration owner and restricted runtime role, and is additive so it can be applied before the matching application is deployed.

## Password and recovery behavior

New passwords use Argon2id. Existing bcrypt hashes continue to authenticate and are replaced with Argon2id after the first successful login. Password reset links carry the random token in the URL fragment so it is not sent in HTTP requests; the reset page removes it from browser history after capture and still accepts previously issued query-string links. Only the token's SHA-256 hash is stored. Tokens are single use, expire after one hour, and password changes revoke the user's active sessions.

Login and reset attempts use durable HMAC-derived account/IP identifiers. The reset UI and server action return the same success response for absent, inactive, and rate-limited accounts. Reset tokens, email addresses, and password values are not written to application logs.

## Run order

1. Completed: run `scripts/migrations/015-auth-session-foundation.sql` on Neon Dev.
2. Completed: run `scripts/migrations/015-verify-auth-session-foundation.sql`; independent verification returned `access_pass=true`.
3. Completed: repeat the unchanged migration and verification on unused UAT; independent verification returned `access_pass=true`.
4. In progress: credentialed Dev login, protected-page access, sign-out, password reset, and post-reset login pass. Independent verification confirms a valid stored token hash, login audit, automatic bcrypt-to-Argon2id upgrade, and sign-out revocation. Migration 015a reconciled the caregiver test identity's one unambiguous profile/membership role mismatch on Dev; the user then reached the caregiver screen with the reset password. The user applied 015a to UAT and independent read-only verification returned zero mismatches, zero orphaned profiles, one repair audit, and `reconciliation_pass=true`. Reset-token replay denial, password-change revocation, inactive-user denial, and cross-agency membership denial remain.
5. Deploy the matching code to UAT and repeat the synthetic acceptance cases before removing any Supabase auth configuration.

Do not deploy the new authentication code before migration 015 is present. Code fails closed when the session tables are unavailable. Keep `AUTH_SECRET`, `AUTH_URL`, and the Neon runtime `DATABASE_URL`; Supabase environment variables remain necessary until the separate Realtime and storage slices are complete.

Before a production migration is designed, add an operational retention job for expired sessions, used/expired reset tokens, and old rate-limit events. UAT volume is bounded, but these evidence tables should not grow indefinitely.

The first local login encountered and cleared a pre-migration JWT cookie, which Auth.js logged once as `JWTSessionError: Invalid JWT`. The newly issued opaque session then authenticated `/pages/admin` successfully. UAT is unused, so no external-user cookie transition exists there; a later production plan should explicitly account for one-time legacy-cookie rejection or coordinated cookie-name rotation.

The first Dev recovery request created one active hashed reset token and one request audit. Mailgun event history shows the message was accepted and delivered to the recipient mail server with SMTP code 250. A completed password reset for the caregiver test account produced an Argon2id hash, but login correctly failed closed because its profile role was `company_owner` while its sole active membership and linked caregiver record identified it as `staff_member`. Migration `015a-reconcile-caregiver-profile-role.sql` repairs only that single unambiguous mismatch, refuses any other candidate count, and records an identifier-only reconciliation audit. Apply and verify 015a on Dev before UAT.

## Rollback

Before deployment, rollback is simply withholding the code. After deployment, roll back the application to the prior build; the additive tables and triggers may remain unused. Dropping session tables would immediately sign out every user and should occur only through a separately reviewed migration.
