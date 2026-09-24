# Visit execution and financial cutover

Prepared 2026-09-22 for local Dev and Azure UAT. Migrations 009 and 010 are applied and verified on both branches. Migration 011 is ready for manual Dev-first application.

## Live evidence

The live Supabase source and Neon Dev were inspected for `visit_time_entries`, `visit_approvals`, `visit_financials`, and `visit_adjustment_history`. The staged target columns match the source metadata inspected here. Dev and UAT remain closed under forced RLS from migration 002. Source policies use broad helper functions and include caregiver/manager writes; those policies will not be copied because their membership-state and cross-record guarantees are insufficient for the Neon runtime.

The code inventory found direct reads in caregiver visit pages, Time & Billing, payroll/billing reports, and a browser-side sidebar badge. Mutations span caregiver notes/clock operations, coordinator approve/void, report backfills, and contract-rate recalculation.

## Confirmed defects before access

- `visit-approval-financials.ts` wrote a nonexistent `visit_adjustment_history.comment` column. It now writes the real structured previous/current hour columns and `note`.
- Time & Billing page scope and approve/void actions derive role/agency from the session rather than reloading the current active Neon profile and membership.
- The sidebar queries `visit_financials` directly with the Supabase browser client.
- Approval/void operations currently span several tables without an owned transaction; caught errors can leave partial financial state.
- Contract-rate recalculation directly backfills frozen financial rows and logs audit failure without rollback.
- Caregiver clock actions call database functions that are absent from Neon; caregiver note writes are direct SQL.

## Controlled sequence

1. **009 manager reads:** applied and independently verified in Dev/UAT. See [manager visit-financial read cutover](uat-manager-visit-financial-reads.md).
2. **010 caregiver execution writes:** applied and independently verified in Dev/UAT. See [caregiver visit execution cutover](uat-caregiver-visit-execution.md).
3. **011 coordinator approval/void:** applied and independently verified with 011a hardening in Dev/UAT. See [manager visit-financial write cutover](uat-manager-visit-financial-writes.md).
4. **012 financial maintenance:** application change complete. Contract-rate batches and mileage writes are current-manager, agency-scoped, atomic, and audited. Rate edits no longer materialize or rewrite historical financial rows. See [financial maintenance cutover](uat-financial-maintenance.md).

Each migration is Dev-first, independently verified, and then coordinated with the unused UAT environment. Production and Supabase remain unchanged.

## Current validation

Migrations 009-011a are verified on Dev/UAT. The 012 transaction and UI tests cover current-manager maintenance, batch rollback, cross-agency and invited denial, audit rollback, mileage validation, and frozen-history preservation. No remote writes were made by the agent.
