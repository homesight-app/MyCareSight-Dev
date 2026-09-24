# UAT caregiver visit execution cutover

Prepared 2026-09-22 for local Dev and unused Azure UAT. The user applied migration 010 to both branches; read-only verification returned every control boolean and `access_pass=true` on Dev and UAT.

## Result

The caregiver visit list, detail, past summary, clock-in, clock-out, task completion, and visit-note paths now reload the current active `staff_member`, active matching agency membership, and active caregiver record from Neon. Mutations lock and verify the assigned visit and commit the change with an identifier-only audit in one transaction. Client/session role, agency, caregiver, patient, and assignment values do not authorize access.

The prior Supabase RPC names are no longer called. Clock-in creates one `pending_review` time entry and is retry-safe. Clock-out calculates actual/billable hours, completes the scheduled visit, and causes a migration-owned PostgreSQL trigger to create or refresh the pending financial row. The runtime role receives no INSERT or UPDATE grant on `visit_financials`.

Migration 010 adds assigned-caregiver SELECT/INSERT/UPDATE policies to the already forced-RLS `visit_time_entries` table. INSERT and UPDATE grants are column-limited. Task completion is limited to `completed_at` and `updated_at`; task text and ownership columns cannot be updated by the runtime role. Broader RLS remediation for the pre-existing `scheduled_visits` and `scheduled_visit_tasks` tables remains a separate controlled slice because those tables serve manager, platform, scheduling, assignment, and open-visit workflows.

PHI-bearing list/detail responses are no longer held in the shared Next.js data cache. Each successful read writes an audit event. Audit details contain operation/resource identifiers and booleans only; note text and GPS coordinates are excluded.

## Manual order

1. Completed on Neon Dev: [010-caregiver-visit-execution-access.sql](../../scripts/migrations/010-caregiver-visit-execution-access.sql). The first-run `DROP TRIGGER IF EXISTS` notice was expected.
2. Independently confirmed on Dev: [010-verify-caregiver-visit-execution-access.sql](../../scripts/migrations/010-verify-caregiver-visit-execution-access.sql) returned one row with `access_pass=true` and every component boolean true.
3. Completed on Neon UAT and independently confirmed with the same verification script; all control booleans and `access_pass` returned true.
4. With synthetic accounts only, confirm an active assigned caregiver can view the visit, clock in, complete a task, save a note, and clock out. Confirm an unassigned, inactive, invited, or cross-agency caregiver cannot view or mutate that visit.
5. Confirm clock-out creates one pending financial row, retrying clock-out creates no duplicate, task content is unchanged, and audit events contain no note or coordinate values.
6. Do not apply this UAT migration to the separate production repository/database.

## Validation

The disposable PostgreSQL test executes migrations 002, 009, and 010 and verifies assigned caregiver execution, inactive denial, task-column denial, exact grants/policies, trigger installation, and financial-row derivation. All 149 tests across 11 suites, TypeScript, focused legacy-config lint, whitespace checks, and a clean production build pass. The build retains existing unrelated Edge-runtime, React-hook, and Browserslist warnings.

## Remaining gates

Live synthetic role acceptance remains pending. Coordinator approval/void and financial maintenance writes remain closed pending 011 and 012. The legacy scheduled visit/task tables still need their own cross-role RLS migration after all callers are placed behind current-identity server boundaries. Azure runtime identity, storage, Realtime, Auth.js completion, deployment, and final Supabase environment-variable removal remain pending.
