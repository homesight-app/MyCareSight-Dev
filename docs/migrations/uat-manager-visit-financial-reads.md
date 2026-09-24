# Manager visit-financial read cutover

Prepared 2026-09-22 for local Dev and unused Azure UAT. The user applied migration 009 to Dev and UAT; read-only catalog checks confirmed the expected state on both branches.

## Scope

Migration 009 opens SELECT only on `visit_time_entries`, `visit_approvals`, `visit_financials`, and `visit_adjustment_history` for active `company_owner` and `care_coordinator` users with an active matching agency membership. Each policy also validates the linked scheduled visit/time entry and patient/caregiver identifiers. Invited, pending, inactive, mismatched-agency and caregiver users receive no rows. INSERT, UPDATE and DELETE remain denied.

The Time & Billing dashboard now reloads the current Neon profile and membership inside its transaction instead of trusting session role/agency fields. Its result identifiers and the pending badge count are audited before results return. Audit failure returns no dashboard records or badge count. The sidebar's direct Supabase browser query has been removed.

This migration does not enable caregiver time-entry reads or any writes. Those remain in 010 and 011.

## Manual execution

1. Completed on Dev and UAT: [009-manager-visit-financial-read-access.sql](../../scripts/migrations/009-manager-visit-financial-read-access.sql).
2. Independently confirmed on both branches: [009-verify-manager-visit-financial-read-access.sql](../../scripts/migrations/009-verify-manager-visit-financial-read-access.sql) returns four rows with `read_access_pass=true`, forced RLS, SELECT allowed, writes denied, and one exact policy per table.
3. Test with synthetic active owner/coordinator accounts. Verify the correct agency dashboard and badge, then deny an invited membership, inactive profile, caregiver account, and different agency.
4. Because UAT is intentionally unused, apply and verify there after Dev succeeds. Never run against Production or Supabase.

## Validation

Disposable PostgreSQL tests execute 002 and 009 and verify exact policies, active-membership access, invited denial and write denial. The full suite passes with 147 tests across 11 suites. TypeScript, focused lint, whitespace checks, and a production build pass with the existing unrelated Edge/runtime and hook warnings.
