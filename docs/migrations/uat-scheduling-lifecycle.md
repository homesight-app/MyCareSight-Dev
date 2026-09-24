# UAT scheduling lifecycle cutover

Prepared 2026-09-23 for local Dev and Azure UAT. The user applied migration 014 to Dev and UAT. Independent read-only verification returned three `access_pass=true` rows and both helper checks true on each branch.

## Live findings

The authoritative Supabase source and Neon Dev/UAT have matching column signatures for `scheduled_visits` (21 columns), `scheduled_visit_tasks` (10), and `visit_series` (18). No records were read. The source policies rely on Supabase identity helpers, so they were not copied to Neon.

Before 014, all three Neon tables have RLS disabled and no policies. The runtime role has broad table privileges. This leaves schedule definitions, recurrence data, caregiver assignment, and task completion without database-enforced tenant isolation.

The existing `caregiver_can_execute_visit(uuid, uuid)` helper was inspected on both target branches. It verifies the current active profile, active membership, and caregiver assignment. The clock-out financial trigger is owned by `neondb_owner`, whose live role has `BYPASSRLS`; the application runtime role remains `NOBYPASSRLS`.

## Application boundary

The manager scheduling repository now:

- reloads the current active `company_owner` or `care_coordinator` and matching active agency membership;
- validates patient, caregiver, service-contract, address, visit, task, and series ownership from Neon;
- locks visits and recurrence series in deterministic order;
- commits schedule/task/series writes and identifier-only audit events in one transaction; and
- throws on nested recurring-operation failures so the full transaction rolls back.

Browser-facing schedule reads and writes in the query bridge, visit dashboards, and assignment actions use this boundary. Caregiver list/detail execution reads remain behind the existing active-caregiver repository. Caregivers receive read access to their assigned visits and currently unassigned visits plus task-completion updates; they do not receive schedule-definition, assignment, recurrence, or deletion access.

## Migration 014

Run [014-scheduling-lifecycle-access.sql](../../scripts/migrations/014-scheduling-lifecycle-access.sql) on Neon Dev first. It:

- installs `scheduling_caregiver_can_read(uuid, uuid)`;
- adds agency/date, caregiver/date, visit-task sort, and series lookup indexes;
- enables and forces RLS on all three scheduling tables;
- installs manager lifecycle policies and caregiver read/task-completion policies;
- replaces broad privileges with column-scoped INSERT/UPDATE grants; and
- keeps agency, patient, assignment, and recurrence ownership columns immutable through the runtime role.

Then run [014-verify-scheduling-lifecycle-access.sql](../../scripts/migrations/014-verify-scheduling-lifecycle-access.sql). Expect three table rows with `access_pass=true`, plus `runtime_helper=true` and `helper_not_public=true`. If Dev passes, repeat the migration and verification on the unused UAT branch. Do not run either script on Supabase or Production.

## Validation and remaining gates

Four focused PGlite tests cover active membership and patient ownership, recurring-operation rollback, audit rollback, exact policy/grant installation, and caregiver visibility boundaries. The complete validation run passes: 166 tests in 14 suites, TypeScript, focused legacy-config ESLint, whitespace checks, and a production build. The build retains existing React Hook and stale Browserslist warnings. Standard `npm run lint` still requires the repository's pending ESLint 9 flat-config repair.

Live Dev/UAT application and negative-access acceptance remain pending. The scheduling UI still uses local form state rather than the shared React Hook Form/inline-field-error pattern. Production and Supabase remain unchanged. The agent performed no remote write.
