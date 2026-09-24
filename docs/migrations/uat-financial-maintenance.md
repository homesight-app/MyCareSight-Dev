# UAT financial maintenance cutover

Prepared 2026-09-22 for local Dev and Azure UAT. This 012 slice is application-only and requires no database migration script.

## Result

Contract bill-rate changes, visit mileage changes, payroll/billing report reads, and Rate Manager reads now reload the current active `company_owner` or `care_coordinator` and matching active agency membership inside an owned transaction. Session profile role and agency values do not authorize these operations.

Contract bill-rate changes lock all selected agency contracts in deterministic order and commit the complete batch with identifier-only audits. A current contract-rate edit no longer inserts or updates `visit_financials`; previously approved or voided financial snapshots remain unchanged. Historical financial corrections therefore require a future explicit correction workflow rather than occurring as a side effect of Rate Manager.

Mileage writes lock an agency-owned visit and commit the value with its audit. Report and Rate Manager reads are agency-scoped and audited before their data is returned. Patient, caregiver, contract, visit, time-entry, approval, and financial queries include the verified agency or derive their IDs from agency-scoped visits.

## Database impact

No new policies or privileges are needed. Migrations 009-011a already provide the required financial-table access, and the two legacy tables used here already have broad runtime grants while their wider caller migration remains incomplete. Adding RLS or revoking those grants in 012 would break scheduling and contract workflows that have not yet moved behind audited server boundaries.

The remaining broad `scheduled_visits`, `scheduled_visit_tasks`, and `patient_service_contracts` access is a documented follow-up. This slice reduces the reachable application writers but does not claim database-level isolation for those legacy tables.

## Validation

Transaction tests cover atomic bill-rate batches, cross-agency denial, invited-membership denial, audit-failure rollback, mileage validation, and identifier-only audit content. UI tests cover one-call bill-rate batches and blank-value rejection. All 157 tests across 12 suites, TypeScript, focused legacy-config lint, whitespace checks, and the production build pass. The build retains existing unrelated React-hook and Browserslist warnings.

## Remaining gates

The bill-rate tab uses the shared client/server Zod schema, one atomic server call, a required marker, accessible labels, server errors, and Sonner success feedback. It remains a controlled-input table rather than React Hook Form and does not yet map batch field errors to individual bill-rate inputs.

The full patient-service-contract create/edit/status/delete workflow remains in the transitional query layer and needs its own server repository before legacy-table RLS can be enabled. Live catalog inspection confirmed that its four Supabase functions (`append_patient_service_contract`, `reconcile_patient_service_contract_statuses`, `set_patient_service_contract_status`, and `delete_patient_service_contract`) are absent from Neon Dev/UAT, so those flows cannot be accepted until the next slice replaces them. Scheduled visit/task RLS, an explicit audited historical-financial correction workflow, Azure runtime identity, storage, Realtime, remaining database callers, Auth.js completion, deployment, and Supabase environment cleanup remain pending.
