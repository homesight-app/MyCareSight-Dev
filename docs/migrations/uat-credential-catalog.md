# Credential catalog read-access cutover

Prepared 2026-09-21 for Neon Dev/UAT only. Migration 004 is now present in Dev and UAT. Read-only checks on 2026-09-21 confirmed enabled/forced RLS, the expected active-reference SELECT policy scoped to mycaresight_app, SELECT privilege, and no runtime writes. The agent performed no remote writes; application acceptance remains pending.

## Behavior and scope

The server-only credential repository authenticates every request, validates the session actor ID, and loads current Neon account/membership state in transaction-local user context. Active admin/expert accounts may read global reference labels. Company owners, coordinators, and staff require an active user_agency_roles membership with the same role as their current Neon profile. Because these are global reference labels, any such active agency membership qualifies; this does not authorize access to that agency's people or visits.

The database SELECT policy repeats those checks using app.current_user_id. It does not trust the session role/agency settings to grant access. Missing or invalid context has no matching actor. Runtime INSERT, UPDATE, DELETE, and other write privileges remain absent, and all six other staged tables stay closed. No SECURITY DEFINER function is introduced.

The Supabase source permits authenticated SELECT on credential_catalog. This cutover adds active-account/membership restrictions. It preserves skill-only filtering, trimmed labels, name deduplication, preference for a named category over Other, and existing inactive-reference behavior. Requirement ID is added as a deterministic ordering tiebreaker.

This repository reads only global reference labels, not individual caregiver credentials, patient data, or requirement notes. It introduces no PHI read or mutation audit event. Generic serializable errors avoid exposing database details.

## Caller audit

- lib/supabase/query/task-required-credentials.ts now re-exports the authorized repository, preserving public names and the successful result shape.
- app/actions/query-bridge.ts calls that self-authenticating boundary directly, avoiding nested context transactions.
- lib/server-cache/reference-lists.ts preserves getCachedCaregiverSkillCatalog as a compatibility name but removes its unstable_cache wrapper. Every call rechecks access, including calls from app/actions/reference-data.ts.
- CaregiverProfileContent, ClientDetailContent, and EditCaregiverSkillsModal retain their existing action entry points. No form or modal was modified.
- Other reference-list caches and their authorization are outside this change.

All paths above are under src/. No client accepts or supplies the authorization actor, agency, or role.

## Live schema evidence and tests

Read-only source list_tables, information_schema.columns, and reference policy checks were repeated. The corresponding columns were checked in explicitly selected Neon Dev and UAT. Both targets already grant the runtime SELECT on the policy/query dependency tables. This migration does not expand those grants. If future RLS is added to user_profiles or user_agency_roles, retest these policy subqueries for recursion and visibility.

Fifteen new integration tests execute repository SQL and migration 004 against disposable PostgreSQL under SET LOCAL ROLE mycaresight_app. Coverage includes allowed roles, invited/pending/inactive membership denial, mismatched/missing membership, deactivated users, stale session roles, context cleanup, cached-entry compatibility, generic errors, write denial, unchanged access on the other six tables, and safe repeat rejection. All 80 tests, TypeScript, and focused lint passed. Standard lint still fails because ESLint 9 lacks the expected flat configuration. The production build also passed with synthetic service settings; existing Edge-runtime/React-hook warnings remain. This synthetic build artifact must not be deployed; rebuild with UAT configuration.

## Manual execution

1. Keep the local app on the updated code and DATABASE_URL using mycaresight_app.
2. Select Neon project steep-sky-59385366, branch dev (br-bitter-dust-axfgiziy), database neondb, using an independent migration owner.
3. Run [004 read access](../../scripts/migrations/004-credential-catalog-read-access.sql).
4. Run [004 verification](../../scripts/migrations/004-verify-credential-catalog-read-access.sql). Expect access_pass=true, runtime_select=true, runtime_write=false, one SELECT policy, and RLS enabled/forced. Inspect its displayed expression against the migration.
5. Exercise the skill dropdown through the local app using synthetic accounts. An empty dropdown is expected if task_required_credentials has no links to the four synthetic credential IDs; 003 only seeded catalog rows. This script does not reconcile or import the full reference catalog.
6. After Dev verification, apply/verify on uat (br-empty-mouse-axnk8fbc). UAT application acceptance requires the matching code release. Keep the broader hold on pushing main until the remaining release gates pass.
7. Do not run against the production branch or Supabase.

004 is one-time per branch. A repeat safely aborts; use its verification script instead. If a statement fails, ROLLBACK before retrying and inspect the precondition rather than removing it. The 002 verification credential row is expected to report stage_pass=false after 004, because the table intentionally leaves closed staging. The other six 002 staging rows should remain true.

No new seed is required for the permission change. Full reference-data reconciliation remains separate; do not copy production data to populate dropdowns.

## Rollback

Keep the table and its records. To return credential access to staged denial, the migration owner can revoke SELECT on public.credential_catalog from mycaresight_app and drop only credential_catalog_active_reference_select, in one transaction. Keep ENABLE/FORCE RLS and do not broaden grants. The new repository then returns a generic load error until access is restored. Do not drop or recreate the table.

Supabase authentication/profile lookup still underlies getSession. Supabase environment variables remain required.
