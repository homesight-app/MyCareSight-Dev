# UAT Capability-Based Feature Plans

## Purpose

Feature plans now grant stable product capabilities instead of individual menu items. Navigation remains a presentation concern, so adding or regrouping menu links does not require editing every plan. Server pages, actions, and repositories enforce the same capabilities used by the sidebar.

The six initial capabilities are:

| Capability | Included scope |
|---|---|
| Client Management | Leads, clients, and client records |
| Care Operations | Scheduling, shift creation and management, matching, advertising and assignment, caregiver visit execution, pay and bill rates, time, billing, and payroll preparation |
| Caregiver Management | Caregiver accounts and profiles |
| Agency Compliance | Agency certification and compliance records |
| Analytics & Reporting | Operational reports and exports |
| HomeSights Services | HomeSights services and templates |

Care Operations is intentionally atomic. A plan cannot grant shift management without the execution and financial workflow needed to complete that care. Caregiver Management remains independent, so an agency may operate already-provisioned caregivers without permission to create or maintain caregiver accounts.

Existing role permissions still apply. Home, agency user administration, and configuration remain baseline access where the user's role already permits them. An agency without a plan receives only that role's baseline access. Missing, inactive, or unrecognized capabilities fail closed.

## Database change

Migration `025-capability-based-feature-plans.sql` creates a fixed capability catalog and normalized plan assignments, maps the synthetic UAT menu flags to capabilities, removes the old `plan_features` table, adds plan integrity constraints, and forces RLS on plan data. Plan writes are limited to active platform administrators. Active agency users may read only capabilities assigned to their own agency plan.

The migration stops before making changes when it finds duplicate case-insensitive plan names, an agency assigned to a missing plan, or a legacy plan row assigned to a missing plan. Plan creation, editing, deletion, and agency assignment are transactional and produce identifier-only audit events.

## Deployment order

1. Apply migrations through 024 where they are not already present.
2. Apply `scripts/migrations/025-capability-based-feature-plans.sql` to Development with the independent migration-owner connection.
3. Run `scripts/migrations/025-verify-capability-based-feature-plans.sql`; every boolean must be `true` and every count must be zero.
4. Complete the Development acceptance checks below.
5. Repeat the migration, verification, and acceptance checks on UAT.
6. Apply 025 to the schema-only `environment-base` so newly created environments have the same capability model.
7. Deploy the matching application build only after the database migration succeeds in that environment.

Do not deploy this application code before migration 025 because it reads `capability_catalog` and `plan_capabilities`. Production remains unchanged and outside this UAT migration slice.

## Synthetic acceptance

- A plan with Care Operations shows Care Visits and Time & Billing to agency managers and My Care Visits and My Calendar to caregivers.
- Removing Care Operations hides those routes and direct page, action, and repository access fails closed.
- A plan with Care Operations but without Caregiver Management keeps care workflows available while hiding the caregiver directory and blocking manager caregiver-account/profile maintenance.
- Adding Caregiver Management does not grant scheduling, visit execution, time, billing, or payroll access.
- Preferred or required caregiver skills do not alter plan entitlements.
- An agency with no assigned plan retains only the baseline routes already permitted to each role.
- Creating or editing a plan either commits its metadata, capability rows, and audit event together or rolls back all of them.
- Cross-agency and inactive-membership reads return no plan capability rows.

Use synthetic identities and records only. Do not add PHI to Development, UAT, test output, or screenshots.

## Rollback and future import

Because no customer uses the existing plan configuration, 025 deliberately replaces the old menu-key table. Before applying it, retain the normal Neon restore point. Rolling back the database requires restoring that point together with the earlier application build; do not run the new build against the old schema or the old build against the new schema.

This migration changes product configuration rather than client or visit data. A future production migration should map each commercial tier to these stable capability keys. It should not import or recreate individual menu-item flags, and it must be designed only when the separate production migration is authorized.
