# UAT visit correction rollout

This change applies to the Neon-backed Development and UAT environments only. The operator confirmed that current Supabase production visit records are dummy data and must not be imported. This rollout does not migrate data or change the live Supabase application.

## Order

1. In Neon **Development**, apply `scripts/migrations/030-visit-correction-history.sql` as a normal SQL script, without wrapping it in `EXPLAIN`. Then run `scripts/migrations/030-verify-visit-correction-history.sql`. Expect `table_exists`, `forced_rls`, `app_can_read`, `app_can_insert`, `app_cannot_update`, and `app_cannot_delete` to be true, and `policy_count` to be 2. `correction_count` should initially be 0.
2. Deploy the matching application build to Development and test with synthetic visits and caregivers. Confirm the full visit list marks a corrected visit, Visit Details shows its history, a manual completion creates a pending Time & Billing item without a fabricated EVV clock event, and a correction back to missed voids pending finance. Confirm a care coordinator cannot correct, and an approved financial decision blocks correction until separately voided.
3. Repeat the SQL apply, verifier, application deployment, and synthetic acceptance in Neon UAT and its Azure UAT app. Do not promote the application before the corresponding Neon branch has migration 030.

## Privilege repair after the first 030 rollout

The operator's first read-only 030 verifier returned `app_cannot_update = false` and `app_cannot_delete = false`. The table has only SELECT and INSERT RLS policies, but its effective table grants still included UPDATE and DELETE. Migration 030 revoked `PUBLIC` privileges without revoking a grant held by `mycaresight_app`. The source migration now revokes both for future fresh branches. For every Neon branch where the original 030 has already run, apply `scripts/migrations/031-repair-visit-correction-privileges.sql` once before deploying the app, then run `scripts/migrations/031-verify-visit-correction-privileges.sql`. The repair is idempotent and changes no rows. All verifier booleans must be true, `policy_count` must be 2, and the existing correction count must remain unchanged. A failed 031 post-check rolls back its grant changes and requires role/ownership review; do not use the feature until resolved.

The correction, time entry, pending financial record, history, and audit event are committed in one database transaction. A missing required record or failed audit rolls back the status change. Manual completion needs an active caregiver, actual start/end, proposed billable hours, a reason, and administrator verification. It remains pending until normal Time & Billing review resolves rates and contract. Approved financial records must be voided through the existing Time & Billing workflow before changing the visit status. Existing EVV clock timestamps are preserved as evidence.

## Operational limits and rollback

The correction history is append-only for the application role. Do not delete history to reverse a correction; use a further correction with a new reason. If an invoice or payroll export was already sent outside the application, finance staff must reconcile it separately; the application has no immutable export ledger to reverse it automatically. If deployment fails, roll back the application build while retaining migration 030 and its history. The table is additive and can remain unused. Investigate any failures using identifiers and status metadata only; do not copy reasons, visit details, or other PHI into issue trackers or CI logs.
