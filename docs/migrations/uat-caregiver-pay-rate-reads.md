# Caregiver pay-rate read cutover

Prepared 2026-09-21 for Dev/UAT. Migration 005 is now present in Dev and UAT. Read-only checks confirmed its expected SELECT-only policy/grants and forced RLS on 2026-09-21. Application code remains local; the agent performed no remote writes. This is the read phase of the pay-rate workflow. Rate editing remains blocked until a separate write migration and code/form changes are tested.

## Access rules

All known pay-rate readers now use src/lib/repositories/caregiver-pay-rates.ts.

- Active platform admin/expert accounts retain the cross-agency history scope previously allowed by the profile action.
- Company owners and coordinators need a current active membership of the matching role in the caregiver's agency.
- Staff need a current active staff membership and an active caregiver record linked to their own user ID. They cannot read peers' rates or request an agency-wide rate list.
- The pay-rate row's agency must match its linked caregiver's agency, including for platform users.
- Supplied caregiver/agency IDs only narrow that scope. Mixed authorized/unauthorized caregiver selections fail as a whole so reports cannot quietly compute partial payroll.
- Every successful read and its identifier-only audit event share a transaction. Failed audit writes fail the read. Names, rate amounts, date filters, and other record contents are omitted from audit details.

The source agency-read helper also admits invited caregivers and does not limit staff to their own rate records. That behavior is deliberately tightened. Platform access follows the existing application profile rule; it is not represented as a verbatim copy of the source pay-rate SELECT policy.

The shared Zod request schema validates UUID selections (maximum 5,000, deduplicated), valid calendar dates, and explicit scope. Current-date filtering remains half-open: effective_start <= date < effective_end, with null end meaning unbounded. Empty explicit selections remain empty. Numeric/date outputs are normalized for existing consumers.

## Caller changes

| Caller | Change |
| --- | --- |
| pages/agency/caregiver/page.tsx | Current effective rates move from Supabase to the repository. Other staff/credential Supabase queries remain. |
| pages/agency/caregiver/[id]/page.tsx | Current rates move to Neon; its now-unused Supabase client is removed. |
| pages/agency/user-management/page.tsx | Current rates move from Supabase to the repository; unrelated Supabase queries remain. |
| actions/caregiver-profile.ts | Rate history uses the audited boundary. Schedule authorization remains a separate follow-up. |
| actions/payroll-billing-report.ts | Rate-manager reads use the throwing repository wrapper; failed access is not treated as missing rates. |
| lib/payroll-billing-report.ts | Report rate reads use the same boundary. |
| lib/visit-approval-financials.ts | Approval rate reads include the visit's agency filter and propagate access failures. |

Paths are under src/app unless prefixed lib/. No form/modal was edited. This does not certify the entire payroll report, patient-contract, schedule, or approval workflow; their other data access and mutations still need migration work.

src/db/index.ts adds withActorContext. It reuses an existing transaction only after checking its current actor matches the authenticated actor, preserving the parent role/agency context. Otherwise it opens a fresh transaction. This avoids nested connection acquisition in report calls and keeps the read audit in the parent transaction; a parent rollback also rolls back the audit.

## RLS migration

005 adds one SELECT policy and grants SELECT only on caregiver_pay_rates to mycaresight_app. The policy independently verifies current active Neon identity, matching active membership, caregiver self-access, and caregiver/rate agency consistency. It uses no SECURITY DEFINER helper and no stale session role as permission evidence.

INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER privileges remain absent. No access is added to internal_notes, visit_time_entries, visit_approvals, visit_financials, or visit_adjustment_history. Credential SELECT from 004 remains intact.

The live source columns/policies/function metadata and live Dev/UAT columns and dependency grants were inspected through read-only MCP. Both targets have the required profile/membership/caregiver SELECT and audit INSERT grants; their pay-rate tables still have zero runtime access and zero policies. No source records were retrieved.

## Manual Dev-first execution

1. Use an independent migration owner on project steep-sky-59385366, branch dev (br-bitter-dust-axfgiziy), database neondb. Keep the app configured with mycaresight_app.
2. Run [005 pay-rate read access](../../scripts/migrations/005-caregiver-pay-rate-read-access.sql).
3. Run [005 verification](../../scripts/migrations/005-verify-caregiver-pay-rate-read-access.sql). Expect access_pass=true, runtime_select=true, runtime_write=false, one SELECT policy, and forced/enabled RLS. Inspect the displayed policy expression against the migration.
4. Test the local updated code with synthetic accounts/records. Empty pay-rate history is expected if no synthetic rate rows exist; this migration inserts no rate/person data.
5. After Dev succeeds, repeat on uat (br-empty-mouse-axnk8fbc). Live UAT application acceptance requires the matching code release; continue to hold the main push until the broader release gates pass.
6. Production and Supabase are excluded.

This is one-time per branch; rerunning aborts safely. Use verification instead. If a statement fails, ROLLBACK before retrying. Do not remove the migration preconditions.

After 004 and 005, the credential and pay-rate rows in the old 002 staging verifier are expected to have stage_pass=false because reads have intentionally opened. The other five staged tables should still pass. Use the new access verifiers for opened tables.

Rollback closes access without deleting data: in one owner transaction, revoke SELECT from mycaresight_app on caregiver_pay_rates and drop only caregiver_pay_rates_scoped_select. Keep ENABLE/FORCE RLS.

## Remaining pay-rate write work

The existing appendCaregiverPayRateAction still calls the missing append_caregiver_pay_rate function. Source inspection confirms backdated insertion and a next-effective-date boundary, but same-day duplicates and concurrent inserts need explicit handling. The write phase must preserve history, validate active management and agency ownership, serialize updates per caregiver/service band, and commit changes with audit evidence.

That phase also needs a shared mutation schema and review of EditStaffModal and the payroll rate editor under the repository's form rules. Do not grant write access to make the current action run. Approvals/frozen financials and their audits remain a separate transaction/authorization migration.

## Verification evidence

Seventeen new disposable PostgreSQL tests exercise production repository SQL, the actual 005 policy under mycaresight_app, and the real AsyncLocalStorage/transaction helpers with only the postgres.js transport substituted. Coverage includes allowed platform/manager reads, staff self-only access, wrong/mixed agency denial, invited/pending/inactive memberships, inactive accounts, linked-agency mismatches, date boundaries, validation, minimized audit data, audit failure, transaction reuse/mismatch/rollback, context cleanup, denied writes, unchanged denial on five other staged tables, and repeat-script rejection.

All 97 tests, TypeScript, focused lint, and whitespace checks passed. Standard lint still fails on the existing ESLint 9 flat-config issue. The production build passed with synthetic service settings and existing React-hook warnings. The resulting synthetic artifact must not be deployed; rebuild with UAT configuration. No remote writes, deployment, push, or production access occurred.

## Write follow-up

The missing RPC replacement and migration 006 are now prepared; see [pay-rate write cutover](uat-caregiver-pay-rate-writes.md) for atomic forms, history semantics, checks, and manual execution. This read-only runbook describes the pre-006 state.
