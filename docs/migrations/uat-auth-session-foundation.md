# UAT Auth.js PostgreSQL session foundation

Status: application code and migration 015 prepared locally on 2026-09-23. The user applied 015 to Neon Dev and UAT; independent read-only verification returned `access_pass=true` on both branches. Production remains out of scope.

Local validation: the migration executes in synthetic PostgreSQL and its profile-change trigger revokes the session and writes audit evidence. All 190 tests across 21 suites, TypeScript, focused legacy-config ESLint, and the production build pass. Existing unrelated React Hook and Browserslist warnings remain.

## Architecture

### November 25, 2026: approved inactivity policy (local code, not deployed)

The operator chooses **20 minutes idle, 8 hours maximum, with a 5-minute warning**. Previously sessions ended one hour after login even during active work. This is an application policy choice; HIPAA does not prescribe that previous one-hour duration. The automatic-logoff safeguard is described at 45 CFR 164.312(a)(2)(iii); this change is not a compliance certification.

- `src/lib/auth/session-policy.ts` centralizes the limits. New login sessions receive a fixed eight-hour `expires_at`. Every opaque-session read enforces the earlier of that timestamp and `last_seen_at + 20 minutes`, plus existing active-profile/membership/revocation checks. Reads, notification polling and focus checks no longer write `last_seen_at`. Existing schema, grants and indexes suffice; **no new SQL script or manual migration is required**. Previously issued sessions retain their original shorter absolute expiry and may require a fresh login after rollout. A session already idle for twenty minutes is rejected immediately after the new build is installed.
- The independently authenticated `/api/session/status` endpoint returns only server time and effective/absolute deadlines. GET does not renew. Same-origin POST accepts activity for the current HttpOnly opaque cookie, never a body identity or client timestamp. It validates current permissions and conditionally updates only an unexpired, unrevoked session; delayed activity cannot resurrect one. DELETE atomically revokes and writes identifier-only audit evidence, then clears the cookie. Requests reject foreign/missing mutation origins, ignore bearer headers, and use no-store responses. Middleware skips this independently authenticated endpoint so datastore outages remain explicit 503 responses rather than Auth.js's null-session fallback; other protection is unchanged.
- `SessionLifecycle` runs across all five protected role roots, not login/public/contact screens. It reports real foreground input at most once per minute while activity occurs; a coalesced trailing report may lag the actual interaction by up to one minute. The server measures twenty minutes from its last accepted activity report. Timers are local; no idle heartbeat renews the session. Status reads occur on mount, focus/visibility return, cross-tab activity messages, warning/expiry boundaries and explicit retry. There is one in-flight status/activity request per tab, ten-second request timeout, no repeated expiry request loop during an outage, and no collection query. Each valid read is a single token-indexed join/membership check; activity adds one conditional row update. Expiration diagnostics add only one bounded classification query. Cross-tab messages contain fixed event names only, never tokens, identity or form contents. Without BroadcastChannel, focus and deadline checks still verify the server independently.
- At fifteen accepted idle minutes a modal offers Stay signed in or Sign out. Keyboard focus stays in the dialog, Escape/backdrop cannot dismiss it, and background editing is inert. A confirmed expiry hides the portal, attempts revocation/cookie cleanup and replaces the document with the login page. A connection/verification outage blocks editing with Retry instead of falsely claiming expiration. Voluntary sign-out failure stays blocked rather than claiming the server revoked the session. The eight-hour warning offers Return to save work, but never extends the absolute deadline. The session-specific native dialog uses existing shared buttons; the current shared Modal lacks the required native inert/focus behavior, so its public API and unrelated dialogs are unchanged.
- No draft is persisted in localStorage/sessionStorage, sent to another service or automatically submitted. Unsent form state remains only in the mounted page during verification failure and is lost after logout/full navigation. No mutation is retried automatically. Auth.js client metadata now reflects the verified DB expiry instead of advertising a fresh hour on every read. Its redundant focus refetch is disabled in favor of the explicit lifecycle check.

Local validation and limitations are recorded in `docs/hipaa/compliance-log.md`. Operator acceptance should use synthetic accounts in Dev/UAT: warning/Stay signed in, twenty-minute idle logout, activity with the eight-hour cap, tab sleep/resume, cross-tab refresh, manual sign-out, membership revocation and network loss. Confirm the canonical `AUTH_URL` matches the host being tested. No credential, database, cloud setting, push or deployment was accessed. Rollback reverts this code batch; do not drop or rewrite session rows. Eight-hour rows issued by the new code retain that absolute expiry if the old build is restored, so rolling back the enforcement policy requires an operator-reviewed session-revocation decision.

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
