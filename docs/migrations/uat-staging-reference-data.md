# Staging reference-data baseline (037)

Migration 037 restores non-PHI reference rows that a schema-only Neon branch copy omitted. The reviewed source is the UAT reference export from 2026-10-29; tenant, patient, caregiver, visit, document, authentication, session, job, and audit-history rows are not included.

## Scope

The migration seeds task categories and catalogs, configuration types and values, system caregiver skills, license types, pricing, billing codes, and validation rules. It intentionally excludes all `TEST_*` credentials, agency-scoped credentials, Feature Plans, plan assignments, environment settings, branding, and storage paths.

This is an environment-scoped staging seed. Do not apply it to the protected Production branch. Production reference rows must be reconciled against the live production source during the approved cutover.

## Apply to production-staging

1. Confirm the selected Neon branch is `production-staging`.
2. Create a manual Neon snapshot.
3. Run `scripts/migrations/037-staging-reference-data.sql` as the independent migration owner.
4. Run `scripts/migrations/037-verify-staging-reference-data.sql`.
5. Require every verifier column to return `true`.
6. Smoke-test the Admin configuration task lists, client ADL/IADL and Skilled Tasks tabs, licensing configuration, and billing-code selector using synthetic data only.

Migration 037 accepts an empty target or an exact copy of the reviewed baseline. It rejects a non-empty catalog with different rows and makes no changes in that case. Re-running an exact installation is a no-op.

## Production cutover note

Live production currently has zero Feature Plans, zero plan-feature rows, and zero agencies assigned to a plan. At cutover, retain the six canonical capability rows, start `feature_plans` and `plan_capabilities` empty, leave agency plan assignments null, and create and assign real plans through the new capability workflow after migration. Do not promote staging test plans.
