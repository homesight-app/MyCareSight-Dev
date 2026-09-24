# Caregiver pay-rate write cutover

Prepared 2026-09-21 for Dev/UAT only. Read-only checks confirmed 005's expected forced RLS, scoped SELECT policy, SELECT grant, and no runtime writes on both branches. Migration 006 and matching code are local and have not been applied remotely by the agent.

## Behavior

The missing append_caregiver_pay_rate RPC is replaced by an application-owned server-only Neon repository. It requires a current active company_owner or care_coordinator profile and an active matching membership in the caregiver's agency. Platform-only admin/expert and staff accounts retain their read rules but receive no rate-edit grant.

Every save owns one transaction covering authorization, timeline updates, inserts, and identifier-only audit records. A pay batch is all-or-nothing. Edit Caregiver now saves profile fields and the optional rate change in that same transaction; an audit failure after either update rolls back both.

Rates are effective over half-open periods: start <= visit date < end, with null end meaning unbounded. Backdated insertion closes the containing previous period and ends at the next known start. Same-day corrections retain the previous amount/unit/start in a zero-duration historical row and insert the replacement effective period. Identical retries and unchanged effective amounts do not add duplicate history.

The shared rate resolver now excludes an ending rate on its end date, preventing a superseded same-day row from being selected. Frozen visit financial snapshots are not recalculated or changed by this slice.

Pay batches retain each row's unit (hour, visit, or 15_min_unit) and service band. The caregiver hourly field uses the default service band and hour unit. Shared validation rejects blank amounts, negatives, non-finite values, more than two decimal places, amounts outside numeric(10,2), invalid calendar dates, unknown service/unit values, and duplicate caregiver/service bands within a batch.

## Database protection

006 grants INSERT only on the required new-rate columns and UPDATE only on effective_end/updated_at, with manager-only RLS INSERT/UPDATE policies. It does not grant table-wide writes, historical amount/ownership updates, DELETE, or TRUNCATE. The existing SELECT policy remains.

A SECURITY INVOKER trigger rejects historical amount/ownership/start/unit changes and overlapping effective periods. Non-negative amount and valid-period checks plus a unique active-start index reinforce integrity. Existing invalid periods, overlaps, or mismatched caregiver/rate agencies cause migration preflight to abort without rewriting data.

The repository and trigger acquire the same transaction advisory lock per agency/caregiver/service band. Batch processing uses a consistent caregiver/service order before acquiring locks. The application locks before loading or closing periods. The local test database exercises timeline operations and rollback, but does not establish contention behavior across independent Neon connections; a live two-session synthetic test remains an acceptance gate.

No policy or grant is opened on internal notes or the four visit/financial tables. No Supabase write function or SECURITY DEFINER bypass is introduced.

## Forms and compatibility

- EditStaffModal now imports shared caregiverEditSchema, keeps React Hook Form onBlur, uses noValidate, PhoneInput/phoneZodField and EmailInput/emailZodField, maps server field errors inline, and uses Sonner for non-field errors/success.
- Its formerly separate generic staff update and pay action are replaced with saveCaregiverProfileAction. There is no partial profile save if the rate/audit fails.
- RateManagerModal's pay tab uses the same shared batch schema as its server boundary, RHF, inline errors, and one atomic request for changed pay rows. Units are preserved and blank input cannot become zero.
- Saves apply to the selected tab. Switching tabs with unsaved changes requires saving or resetting first, preventing silent draft loss.
- The report's Manage Rates launch button was already commented out. It remains so; the modal is tested directly. Do not interpret this as a newly exposed report feature.
- The bill-rate tab remains on its legacy validation/action path. Its RHF/shared-schema conversion and contract/financial authorization, transaction, and audit work remain explicitly pending. This slice does not make billing writes ready.
- Existing append/update pay action names remain for compatibility, with validation delegated to the new repository. New form operations return success/error/fieldErrors.
- Other generic caregiver update callers (skills, address, status, documents) remain separate migration work. This does not certify all caregiver-table writers or enable caregiver_members RLS.

Relevant files: src/lib/repositories/caregiver-pay-rate-writes.ts, src/lib/schemas/caregiver-pay-rates.ts, src/lib/schemas/caregiver-edit.ts, src/app/actions/caregiver-pay-rates.ts, src/app/actions/payroll-billing-report.ts, src/components/EditStaffModal.tsx, src/components/PayrollBillingReportContent.tsx, and src/lib/caregiver-pay-rates.ts.

## Manual execution

1. Select Neon project steep-sky-59385366, dev branch br-bitter-dust-axfgiziy, database neondb, as the migration owner. Keep application DATABASE_URL on mycaresight_app.
2. Run [006 write access](../../scripts/migrations/006-caregiver-pay-rate-write-access.sql).
3. Run [006 verification](../../scripts/migrations/006-verify-caregiver-pay-rate-write-access.sql). Expect write_access_pass=true, insert_amount=true, close_period=true, overwrite_amount=false, enabled/forced RLS, and three policies (SELECT, INSERT, UPDATE). Inspect their expressions against the migration.
4. Test the updated local Edit Caregiver form with synthetic records and active agency-manager membership: a new rate, a backdated rate, a same-day correction, unchanged-rate retry, and invalid input. Confirm history and audits, and that no frozen approval/financial amounts change.
5. Test denied cross-agency/staff/invited/pending/inactive access and two simultaneous synthetic manager edits. Confirm the final periods do not overlap and both historical changes remain represented. Local tests do not replace this live concurrency check.
6. After Dev succeeds, repeat application/verification on uat branch br-empty-mouse-axnk8fbc. UAT application acceptance requires the matching code release. Continue the main-push hold until the broader release gates pass.
7. Do not run this slice on production or Supabase.

The migration is one-time and rejects repeats. Run the full BEGIN-to-COMMIT script. If it fails, ROLLBACK and inspect the precondition; do not delete history or remove checks to force it through. Existing overlap or agency mismatch needs a reviewed reconciliation.

Use 006 verification after opening writes. The previous 005 SELECT-only verifier is expected to fail its policy-count check after 006. The other five staged tables remain closed.

## Rollback

Close writes without dropping history or weakening read protection. In one owner transaction, revoke the exact column-level INSERT grant (agency_id, caregiver_member_id, pay_rate, effective_start, effective_end, unit_type, service_type), revoke UPDATE(effective_end, updated_at), and drop only caregiver_pay_rates_manager_insert and caregiver_pay_rates_manager_close. Keep the SELECT policy, RLS, timeline trigger, index, checks, and all records. Revoking a table-level grant alone does not remove these column-level grants.

The new form then fails atomically on attempted rate writes. Do not restore the legacy partial profile/rate save or remove timeline protection as a workaround.

## Verification and limits

The live source and both target column schemas were rechecked; their relevant types/nullability match. Source append-function and policy semantics informed the replacement; source records were not copied.

Database tests cover authorization, precision/date validation, service-band independence, half-open dates, backdating, same-day retention, retry behavior, batch rollback, rate/profile audit failure including a late failure, generic errors, direct overlap rejection, immutable historical amounts, and migration preflight/repeat rejection. Form tests cover inline validation, server field errors, one combined caregiver request, changed-row batch mapping, unit preservation, and blank-amount rejection.

Final validation completed 2026-09-22: all 117 tests across nine suites, TypeScript, focused lint, whitespace checks, and the final production build passed. The build used synthetic service settings and retained existing React-hook warnings; its artifact must not be deployed. Rebuild with UAT configuration. Standard lint still has the existing ESLint 9 flat-config failure. No remote writes, deployment, push, or production record access was performed by the agent. Supabase authentication/environment variables remain necessary.

## User-applied migration verification (2026-09-22)

The user applied 006. Read-only execution of the 006 verifier on explicitly selected Dev (br-bitter-dust-axfgiziy) and UAT (br-empty-mouse-axnk8fbc), database neondb, returned write_access_pass=true on both. SELECT, column INSERT, and period-close UPDATE are granted; historical amount UPDATE is denied. RLS is enabled/forced, the timeline trigger is enabled, the active-start index is valid/ready, and all three policy expressions match the intended current-profile/active-membership scopes.

The five remaining staged tables retain forced RLS, zero policies, and no runtime table or column privileges. These are catalog checks, not live edit, negative-access, or independent-connection concurrency acceptance. No application records were queried and no remote writes or production access occurred. Do not rerun 006. Application release and live acceptance remain pending.
