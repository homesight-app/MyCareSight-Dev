# Missing application tables: staged schema migration

Prepared: 2026-09-21. Source metadata was inspected through read-only Supabase MCP; both Neon targets and their parent keys/default grants were checked through read-only Neon MCP. The user reports the test accounts are verified.

Status: the user applied 002 and 003 to Dev and UAT. Read-only verification on 2026-09-21 confirmed all seven staging checks pass and all four synthetic fixtures match on both branches. Runtime access remains closed; see [RLS readiness](uat-rls-readiness.md). No remote writes were performed by the agent.

## What this batch does

Migration 002 creates these seven empty tables:

- credential_catalog
- caregiver_pay_rates
- internal_notes
- visit_time_entries
- visit_adjustment_history
- visit_approvals
- visit_financials

The structure contains 100 columns, seven primary keys, five unique constraints, 28 foreign keys, nine check constraints, 12 additional lookup indexes, and five timestamp triggers. Types, precision, nullability, defaults, and source relationships come from the inspected live schema. The triggers use a small application-owned SECURITY INVOKER helper, with a fixed search path and no Supabase authentication dependency.

It changes no existing application rows or parent-table definitions. Existing accounts remain intact. It does not copy production data, recreate the excluded legacy KV table, repair constraints on other existing tables, or migrate all business functions/triggers.

## Access remains closed during staging

This is a structure-only migration, not the workflow cutover. All seven tables have RLS enabled and forced, with no permissive policies. Table privileges are revoked from PUBLIC and mycaresight_app. The current Neon default privileges automatically grant new tables to mycaresight_app, so explicitly removing those grants is essential.

The migration validates that mycaresight_app is a login role without SUPERUSER/BYPASSRLS and is independent of the executing migration owner. It does not alter existing policies, role memberships, or default privileges.

Local DATABASE_URL configuration was checked without printing credentials and uses the mycaresight_app username. This is configuration evidence only; Azure runtime connection identity remains unverified. An owner/superuser/BYPASSRLS connection is not constrained by this protection and must not be used as the application runtime.

Current callers are not all ready for new RLS policies. Some lack transaction-local user context, and several still call missing business functions. Therefore workflow access remains closed until the matching server-authorization, transaction, and policy changes are ready. Affected paths can still report permission or missing-function errors at this stage; this migration alone does not make them functional.

The source coordinator/caregiver membership helpers also allow invited memberships. Those policies are deliberately not copied. The subsequent access migration must require active membership and validate record agency ownership, including referenced patient/caregiver/visit IDs.

## Deliberate source corrections

- internal_notes.created_by is NOT NULL in the source, but its foreign key uses ON DELETE SET NULL. The new foreign key uses ON DELETE RESTRICT so deleting an author cannot erase required attribution or fail with a contradictory nullability action.
- visit_adjustment_history agency and time-entry foreign keys use ON DELETE RESTRICT instead of CASCADE. Deleting a parent must not silently remove adjustment history.
- Other inspected column and constraint contracts are preserved. Existing constraint names referring to staff_member are retained; no shared columns are renamed.

These are integrity controls, not a claim that all application audit history is immutable or that every cross-table tenant relationship is enforced.

## Execution order

Use the Neon SQL editor with a migration-owner role such as neondb_owner. Keep the application configured with mycaresight_app.

1. Select project steep-sky-59385366, branch **dev** (br-bitter-dust-axfgiziy), database neondb.
2. Run the entire [002 staging script](../../scripts/migrations/002-stage-missing-application-tables.sql), including BEGIN and COMMIT.
3. Run [002 verification](../../scripts/migrations/002-verify-missing-application-tables.sql). It returns seven metadata rows; every stage_pass must be true. It checks expected column/constraint/trigger/index counts and the closed runtime access state.
4. Optionally run [003 synthetic credentials](../../scripts/migrations/003-seed-synthetic-credentials.sql) if test reference rows are wanted.
5. After Dev succeeds, repeat the reviewed scripts on **uat** (br-empty-mouse-axnk8fbc).
6. Do not run this UAT slice against Supabase or the production branch. Do not push main or remove Supabase variables as part of this step.

Both Neon branches use database neondb. The database name does not prove branch identity; verify the console branch selection.

002 is intentionally one-time per branch. It aborts if any target table/helper already exists rather than silently accepting schema drift or altering existing objects. A successful second execution is not expected; use verification instead.

All writes are transactional, with bounded statement/lock timeouts. If any statement errors, execute ROLLBACK before another attempt and inspect the error. Do not drop existing tables or remove the preconditions to force the migration through. Keeping successfully created empty, access-restricted tables is safer than destructive rollback.

## Optional synthetic references

003 inserts only four labeled test rows into credential_catalog:

| Code | Type |
| --- | --- |
| TEST_LICENSE | license |
| TEST_CERTIFICATION | certification |
| TEST_SKILL | skill |
| TEST_ROLE | role |

These are synthetic labels, not valid professional credentials or regulatory requirements. The script creates no accounts, people, visits, notes, or financial records.

It is repeatable when those exact fixture rows match. If a reserved ID/code conflicts with an existing or modified row, it aborts atomically rather than overwriting user data. It grants no runtime access.

This seed does not populate the full production reference catalog or reconcile credential IDs already present elsewhere in Neon. Reference-data reconciliation remains a separate reviewed task; production records are not copied by these scripts.

## Caller review and next cutover

The caller inventory identified these dependencies before enabling any permissive table policy:

| Area | Existing callers | Work still required before runtime access |
| --- | --- | --- |
| Pay rates | actions/caregiver-pay-rates.ts, actions/caregiver-profile.ts, payroll/billing modules | Replace missing append_caregiver_pay_rate; enforce active agency management; use one transaction for rate history and audit. |
| Credentials | lib/supabase/query/task-required-credentials.ts | Reconcile reference records and all server callers; allow authenticated reference reads through a reviewed boundary. |
| Internal notes | actions/internal-notes.ts, actions/applications.ts, actions/playbooks.ts, query/internal-notes.ts | Preserve application-only/platform vs agency-only note separation; set user context for every caller; validate subject/tag ownership and active membership. |
| Visit time | lib/caregiver-care-visits.ts, lib/caregiver-visit-execution.ts, actions/caregiver-visit-execution.ts | Replace missing clock-in/out functions; verify assigned caregiver/agency; validate changes and record audits. |
| Approvals and financials | lib/visit-approval-financials.ts, lib/time-billing-dashboard.ts, lib/payroll-billing-report.ts, actions/time-billing.ts, actions/payroll-billing-report.ts | Wrap multi-row decisions in authorized transactions; preserve append-only adjustment evidence and frozen financial calculations. |

Paths in this table are under src/. The scope review identifies remaining work; it does not certify all callers as safe. No permissive policies or runtime grants are introduced here.

## Verification evidence

- All 65 local tests passed, including 13 new migration tests.
- Tests execute the actual SQL scripts against disposable in-memory PostgreSQL with synthetic fixtures.
- Covered: required metadata, numeric precision, default-grant revocation, RLS denial after accidental grants, constraints, author/history retention, source/runtime-role rejection, missing-parent rejection, full rollback after a late failure, safe repeat rejection, repeatable/conflict-safe synthetic seeding, and timestamp triggers.
- TypeScript and focused legacy-config lint passed; git diff --check passed.
- Standard npm run lint retains the previously recorded ESLint 9 configuration issue. It was not rerun for this SQL/test/documentation-only batch.
- The application build was not repeated because this batch changes no runtime TypeScript or dependencies. The previous messaging build passed with synthetic configuration; that artifact is not deployable.
- No remote schema or data writes, production access, push, or deployment was performed by the agent.
