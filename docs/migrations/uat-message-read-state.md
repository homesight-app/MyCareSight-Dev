# Messaging read-state migration

Status: implemented locally on 2026-09-20; not pushed, deployed, or verified through live user workflows.

## Behavior

- Six missing Supabase RPC dependencies are replaced by parameterized Neon queries in src/lib/repositories/message-read-state.ts.
- The seventh migrated operation, markConversationMessagesAsReadExceptSender, now appends the authenticated reader UUID to messages.is_read instead of assigning boolean true.
- Existing exported names remain available through src/lib/supabase/query/messages.ts to preserve callers.
- Total unread count is a number. Per-conversation and per-client counts retain their existing field names and numeric values.
- Empty selections remain empty; an explicitly empty client filter no longer broadens to every client.
- Null/empty reader arrays are unread; messages sent by the reader and messages already read by that reader are excluded.
- Read updates preserve other readers, prevent duplicate entries, and affect only authorized conversations.
- Source notification records have no message foreign key. The replacement deliberately does not reproduce the source timestamp-window update that could mark unrelated notifications read. Notification acknowledgement remains a separate operation; an exact notification-to-message relationship is still needed.
- This does not migrate Realtime or all message/notification operations. Other legacy message reads, sends, and notification actions still require their own authorization audit.

## Authorization and audit

The repository authenticates every call, including server-page callers; it rejects a supplied reader ID that differs from the session. It also loads current active status and role from Neon. During this transition, the same account ID must be active in both the existing Supabase-backed session helper and Neon.

Active platform administrators/experts retain the source platform-staff conversation scope. Agency access requires an active Neon membership; a profile agency ID or invited/pending membership alone cannot authorize it. Legacy owner conversations without an agency are restricted to the actual owner/participant.

All request IDs and collection sizes are validated server-side using shared Zod schemas. Result limits and batches are capped at 5,000. Source exception-swallowing RPC functions are not recreated.

Operations run with transaction-local user context. Audit events contain operation/resource identifiers, not message content. Audit failure rolls back read-state mutations and prevents reads from being returned. Database error details are not logged or returned by this repository. Role message routes are revalidated after successful mutations; revalidation failure does not report a committed transaction as rolled back.

The existing bridge/actions now call this self-authorizing repository directly for these seven operations, avoiding a redundant outer transaction. Other action wrappers retain their existing behavior.

## Index application status

The user applied 001-message-read-state-indexes.sql to Neon dev and uat. Read-only verification confirmed all three indexes are valid/ready and exactly match the expected definitions on both branches. Production was not queried or changed. The application code still requires local workflow testing and UAT deployment.

## Optional index migration

[scripts/migrations/001-message-read-state-indexes.sql](../../scripts/migrations/001-message-read-state-indexes.sql) adds indexes for active membership checks and conversation application/client lookup. It is a performance migration, not a requirement for correctness of this code.

- Run it manually on Neon dev first, then uat after review/testing.
- Select the branch in the Neon console; both use database neondb, so the database name alone does not identify the environment.
- The script checks column types, uses a transaction and bounded lock/statement timeouts, supports repeat execution, and rejects conflicting index definitions.
- It changes no application records, permissions, credentials, or existing table constraints.
- If execution times out or detects drift, the transaction must be rolled back before retrying; do not remove the checks.
- Rollback of this code does not require dropping these non-unique indexes. Retaining them avoids destructive rollback work.
- No schema migration has been applied by the agent. Missing application tables, constraints, and trigger-dependent workflows remain tracked in the live schema baseline.

## Verification

- 15 local integration tests execute the production repository SQL in an in-memory PostgreSQL engine using only synthetic fixtures. Tests cover scalar/array contracts, cross-agency denial, inactive users, invited/pending memberships, forged readers, bounds, empty filters, idempotence, audit rollback, and index-migration repeatability/conflict rollback.
- Complete suite: 51 tests passed before the final index test was added; the updated messaging suite of 15 tests passed separately (52 tests across the current suites).
- TypeScript check passed.
- Focused lint passed for changed implementation, tests, and Jest configuration using the existing legacy ESLint configuration.
- Standard npm run lint still fails before linting because ESLint 9 expects a flat configuration; this is the recorded pre-existing tooling gap.
- Next.js production build passed using synthetic process-level service settings. The resulting .next output must not be deployed; UAT needs its own configured build. Existing React Hook warnings remain.
- Live account workflows and browser E2E were not run. No live message records were queried or changed.

The development-only PGlite dependency runs PostgreSQL locally; it does not send fixtures to a service. Jest now resolves the existing @/ alias, and test/test:ci enable Node VM modules required by this dependency. See the [PGlite documentation](https://pglite.dev/docs/) for its in-memory execution model.

## Local acceptance before UAT deployment

With the local app connected to dev and synthetic accounts:

1. Sign in, open notifications, and confirm the badge shows a numeric unread count.
2. Open a conversation and confirm its unread count clears for that user.
3. Refresh and repeat opening it; read receipts should remain stable.
4. Sign in as the second synthetic user; their unread state must remain independent.
5. Verify that an invited/pending agency membership cannot read another agency's messages.
6. Confirm corresponding non-content audit events exist.

Keep Supabase settings for now: session/profile helpers and other migration phases still depend on them.
