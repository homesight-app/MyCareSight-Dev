# UAT patient service-contract lifecycle discovery

Prepared 2026-09-22 for local Dev and Azure UAT. Migration 013 is ready for Dev-first review and execution.

## Live findings

The live Supabase source defines `append_patient_service_contract`, `reconcile_patient_service_contract_statuses`, `set_patient_service_contract_status`, and `delete_patient_service_contract`. None exists on Neon Dev or UAT. The local transitional query layer calls those missing functions for normal service contracts and weekly-hour limits.

The local positional call to `append_patient_service_contract` also differs from the authoritative Supabase signature: Supabase expects `effective_date` as the third argument, while both local callers currently pass contract fields first and the date later. Copying the function alone would therefore leave the callers broken.

`patient_service_contracts` currently has no RLS on Neon and the runtime role retains table-wide SELECT/INSERT/UPDATE/DELETE. Service-contract and weekly-hour operations are exposed through the generic query bridge, which authorizes from session profile fields and does not reload current profile/membership state. Several multi-step mutations catch errors inside the outer transaction, so a later failure can commit an earlier change without its audit.

## Completed 013 boundary

1. Shared schemas validate service-contract, weekly-hours, status, detail, and delete operations.
2. One server-only repository reloads the active agency manager and matching active membership, validates patient ownership and billing-code existence, locks affected contract rows, owns the transaction, reconciles status periods, and commits identifier-only audits.
3. Query-bridge client calls and server detail-bundle reads use that repository. The four missing Supabase functions are no longer called.
4. Preserve frozen `visit_financials`; contract lifecycle changes must not rewrite approved or voided snapshots.
5. Migration `013-patient-service-contract-access.sql` enables forced RLS, installs four agency-manager policies, replaces broad privileges with column-limited writes, and adds the contract timeline index. Its read-only companion verifies the exact state.

## Execution order

Run `013-patient-service-contract-access.sql` on Neon Dev first and then `013-verify-patient-service-contract-access.sql`. Continue only if `access_pass=true`. Repeat both scripts on the unused UAT branch. Do not run either script on Neon production or Supabase.

The user applied both scripts to Dev and UAT. Independent read-only verification on 2026-09-22 returned `access_pass=true` on both branches: forced RLS, four exact policies, scoped insert and lifecycle-update rights, immutable agency/patient ownership, and the timeline index all pass.

Five focused tests cover current membership, cross-agency denial, atomic audit rollback, lifecycle operations, and the migration policy/grant shape. The full 162-test suite, TypeScript, focused lint, whitespace checks, and the production build pass. Focused lint and the build retain existing React-hook and Edge-runtime warnings. The service-contract modal still uses local component state instead of the shared React Hook Form pattern; server validation is authoritative, but inline field mapping remains a UI follow-up.
