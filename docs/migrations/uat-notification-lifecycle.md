# UAT Notification Lifecycle Cutover

Status: current-identity code boundary and dropdown Realtime replacement complete; database RLS pending.

## Live schema and access evidence

Read-only inspection on 2026-09-23 confirmed identical `notifications`, `user_profiles`, `user_agency_roles`, and `audit_log` columns on live Supabase, Neon Dev, and Neon UAT. Neon Dev and UAT both currently have `mycaresight_app` SELECT access to `notifications` with RLS disabled and no policies. No application rows were queried.

## Code boundary

`src/lib/repositories/notification-lifecycle.ts` now owns personal notification reads, counts, read-state updates, and deletes. It derives identity from the server session, reloads an active Neon profile, requires an active matching agency membership for agency and caregiver roles, ignores session-profile role/agency claims, and rejects a caller-supplied user ID unless it equals the signed-in user.

Updates and deletes include `user_id = current actor` in the mutation. Identifier-only audits commit in the same transaction, and audit failure rolls back the mutation. The agency landing page uses this repository, removing the last `@/lib/supabase/server` import under `src`. Existing query-bridge and messages action exports now call the owned boundary directly instead of wrapping unsafe low-level notification queries. The header dropdown no longer imports the Supabase browser client; it refreshes through the server boundary every 30 seconds while visible and on window focus/visibility changes, and still refreshes immediately when opened.

## Validation

Three focused PGlite tests cover current-identity reads, cross-user rejection, active membership, owner-only mutations, and rollback on audit failure. The complete 181-test/18-suite run, TypeScript, focused legacy-config ESLint, whitespace checks, and a clean production build pass. The build retains pre-existing React Hook, stale Browserslist, and transitional Supabase/Auth.js Edge-runtime warnings.

## Remaining controlled migration

Do not enable notification RLS yet. Application actions create notifications for other recipients, so a user-owner-only INSERT policy would break those workflows. Live catalog inspection found 21 Supabase notification-producing/helper functions but none on Neon Dev/UAT; UAT therefore already depends on the local application producers. Replace each producer with an authorized repository operation and encode which current actors may notify which recipients, then add forced RLS, owner SELECT/UPDATE/DELETE, constrained producer INSERT, scoped column grants, indexes, and Dev/UAT verification in a later numbered migration. Six other message/program components still use Supabase Realtime and will move to the same polling boundary or a later Azure-compatible event channel.
