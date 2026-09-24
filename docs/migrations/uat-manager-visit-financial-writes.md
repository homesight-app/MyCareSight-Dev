# UAT manager visit-financial write cutover

Prepared 2026-09-22 for local Dev and unused Azure UAT. Migrations 011 and 011a are applied and independently verified on both branches. Both manager UPDATE policies now require valid linked records in their old-row and new-row predicates.

## Result

Time & Billing approval and void actions now use one server-only repository. It validates UUID, hours, service type, decision, and note length; reloads the current active `company_owner` or `care_coordinator` with an active matching membership; sets transaction-local database identity; and locks the agency-owned visit, time entry, approval, and financial row before changing state.

Approval creates immutable adjustment evidence, upserts the approval, calculates and freezes pay and bill amounts, upserts the financial row, updates the time entry, and writes identifier-only audit events in the same transaction. Void preserves the last financial amounts, marks the financial row voided, records a rejected approval and immutable adjustment event, returns the time entry to review, and audits the decision. Any failure rolls back the whole decision.

Migration 011 grants only the columns required by this repository. RLS requires a current active manager, an active matching agency membership, and linked visit/time-entry records on both old and new UPDATE states. Agency, visit, patient, caregiver, and time-entry ownership columns cannot be updated. Adjustment history has INSERT only; runtime has no DELETE on any of the four tables.

## Manual order

1. Run [011a-manager-visit-financial-update-policy-hardening.sql](../../scripts/migrations/011a-manager-visit-financial-update-policy-hardening.sql) on Neon Dev. Do not rerun 011.
2. Run [011a-verify-manager-visit-financial-update-policy-hardening.sql](../../scripts/migrations/011a-verify-manager-visit-financial-update-policy-hardening.sql) on Dev. Expect two rows with `policy_hardening_pass=true`.
3. Repeat 011a and its verification on unused UAT.
4. With synthetic records, approve a pending visit, edit approved hours with a required note, and void it. Confirm the time entry, approval, financial row, adjustment history, and three audit records change together.
5. Confirm an invited/inactive/cross-agency manager is denied, ownership columns cannot change, adjustment history cannot be changed or deleted, and a forced error leaves every record unchanged. Do not apply these UAT migrations to the separate production repository/database.

## Validation

The disposable PostgreSQL suite executes migrations 002, 009, 010, 011, and 011a. It covers active manager linked writes, invited-member denial, immutable adjustment history, exact policy/grant state, and both independent verification queries. The focused suite passes 20 tests and TypeScript passes after adding 011a. The preceding complete 151-test run and production build passed before this policy-only follow-up. The build retained existing unrelated React-hook and Browserslist warnings. Standard `npm run lint` still requires the repository's pending ESLint 9 flat-config migration.

## Remaining gates

Live synthetic role acceptance remains pending. The application-only 012 financial-maintenance slice is documented separately. Scheduled visit/task/contract RLS, Azure runtime identity, storage, Realtime, remaining database callers, Auth.js completion, deployment, and final Supabase environment-variable removal remain pending.
