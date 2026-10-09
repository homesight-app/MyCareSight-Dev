# Future production port impact register

Status: tracking artifact only. This document records UAT changes that a future, separately approved production migration must reconcile. It does not authorize production access, data copying, credential changes, a production freeze, or cutover work.

Production currently remains on Supabase and Vercel in its separate repository. The current MyCareSight-Dev repository, Neon branches, Azure Storage accounts, and migration scripts contain synthetic/non-PHI data only.

## How to use this register later

Before any production data is copied, compare the live production Supabase schema and the target Neon schema. Do not infer either schema from historical migration files. Apply the reviewed target schema and access migrations independently of the production data import, then classify each source table as `import`, `transform`, `recreate empty`, or `exclude`. Any discrepancy must be added here before cutover approval.

The versioned SQL under `scripts/migrations/` is the schema and access-control history. Verification scripts establish catalog and permission expectations; they do not prove data parity or workflow acceptance.

## Current impact register

| Area | UAT change | Future production-data impact | Current disposition |
|---|---|---|---|
| Core application schema | Migrations 001–014 added indexes, missing tables, constraints, triggers, RLS, and scoped runtime grants. | Create and verify the target schema before importing rows. Do not replay UAT rows. Compare live production columns, constraints, functions, and policies first. | Schema recreation required; row transformations unresolved until live comparison. |
| Certification categories | The Neon application writes `licenses.category_id`; the removed legacy `certification_category` column is no longer used. | Inspect production `licenses` and configuration values. If production stores category text or a different identifier, map it to stable target configuration codes/IDs and validate unmatched values. | Transformation may be required. |
| Users and roles | Auth.js uses `user_profiles`, active agency memberships, current roles (`admin`, `expert`, `company_owner`, `care_coordinator`, `staff_member`), and Neon-backed opaque sessions. Legacy `agency_admin` is a table/domain label, not an accepted session role. | Build a deterministic identity and membership mapping. Detect case-insensitive duplicate emails, inactive accounts, and legacy role values. Do not assume Supabase Auth credential hashes are portable to the Auth.js password format. | Identity/credential migration decision remains unresolved. |
| Sessions and recovery | Migration 015 introduced Auth.js sessions, password-reset tokens, rate-limit events, Argon2id credentials, and session-revocation behavior. | Do not carry live Supabase or UAT sessions into the new production environment. Reset/recovery and rate-limit operational rows should start clean unless a later security review requires a narrowly defined carryover. | Recreate empty; user credential transition remains unresolved. |
| Caregivers and profile-role reconciliation | Migration 015a reconciles caregiver profile roles and active membership behavior. | Validate every production caregiver profile against its caregiver membership and agency. Reject or quarantine ambiguous cross-agency or unlinked identities rather than guessing. | Validation/transformation required. |
| Visits and schedules | Migrations 010, 014, 016b, and 018 define caregiver execution, manager scheduling, recurring-series idempotency, and explicit visit lifecycle behavior. Migration 018 does not rewrite existing rows. | Import source statuses exactly only after enumerating production values. Reconcile null, legacy, or time-derived statuses before enabling jobs. Preserve explicit `completed`, `missed`, `cancelled`, `voided`, `on_hold`, and `in_progress` decisions. Validate caregiver, patient, address, contract, task, and series foreign keys. | Status audit and possible transformation required. |
| Visit financials and payroll | Migrations 009–013 enforce manager/caregiver access and atomic approval/void behavior. Application reports now exclude pending/voided rows and calculate overtime using complete work weeks. | Preserve approved/voided history and frozen financial snapshots. Validate numeric precision, work-week configuration, effective-dated pay rates, contracts, approvals, adjustments, mileage, and completed-visit linkage before comparing totals. | Import with reconciliation; no UAT financial rows. |
| Background jobs | Migration 016 and follow-ups introduced job runs, items, outbox, idempotency, visit refill discovery, and notification dispatch. | Import durable business records that jobs inspect, then initialize operational job ledgers deliberately. Do not copy UAT job runs, queue items, or outbox state. Prevent jobs from running until row reconciliation and idempotency checks pass. | Recreate operational tables empty; startup gate required. |
| Website lead integration | Migration 017 introduced credential, delivery, idempotency, and rate-limit tables. Leads enter the existing agency lead structure with source `Website`. | Import production leads according to the normal lead mapping. Do not copy UAT integration secrets, delivery attempts, or rate-limit events. Create new production credentials after the target security boundary is approved. | Business leads import; integration operational/security rows excluded or recreated. |
| Documents and branding | UAT storage moved behind the application-owned Azure Blob boundary with private containers and server-authorized object keys. | Database document records and Blob objects require a coordinated manifest. Preserve record ownership and object-key relationships, verify object counts/size hashes without logging PHI, and issue no public URLs. Supabase Storage paths cannot be assumed to equal Azure object keys. | Separate controlled object transfer and reference reconciliation required. |
| Audit history | Neon mutations create identifier-only audit records and avoid PHI content. | Decide which production audit history is legally and operationally required, validate its source shape, and import it append-only. Never place audit exports or PHI-bearing content in GitHub or CI logs. | Retention/legal decision required before import. |
| Reference/configuration data | Configurable lists use stable codes where logic depends on the value; UAT includes synthetic setup data. | Import approved production reference values or seed reviewed canonical values. Never copy synthetic UAT identifiers blindly when business rows reference different production IDs. | ID/code mapping required. |
| Runtime identities and permissions | Neon uses separate restricted `mycaresight_app` and `mycaresight_jobs` roles; migration owners remain separate. | Roles, grants, RLS, secrets, and connection strings are infrastructure and must be recreated. They are not database rows to copy from UAT. | Recreate and verify independently. |

## Rows that should not be copied from UAT

The future production import must use the live production source, not UAT data. In particular, do not promote UAT values from:

- `auth_sessions`, `password_reset_tokens`, or `auth_rate_limit_events`;
- `background_job_runs`, `background_job_items`, or `background_job_outbox`;
- `lead_integration_credentials`, `lead_integration_deliveries`, or `lead_integration_rate_limit_events`;
- synthetic agencies, users, patients, caregivers, visits, leads, documents, certifications, contracts, rates, notes, or audit events;
- UAT Blob objects, secrets, connection strings, or runtime-role passwords.

## Required future reconciliation evidence

When production migration planning is authorized, record evidence for:

1. Live source and target schema comparison, including columns, types, nullability, constraints, functions, triggers, indexes, RLS, and grants.
2. A per-table import disposition and explicit transformation rules, with rejected-row handling.
3. Identity, agency, membership, role, and case-insensitive email reconciliation.
4. Foreign-key and business-state reconciliation for visits, financials, documents, licenses, programs, and notes.
5. Sequence/identity state, row counts, aggregate totals, and bounded non-PHI checksums or manifests.
6. Private object migration counts and integrity verification through the application-owned storage boundary.
7. Clean initialization and controlled startup of sessions, rate limits, integrations, and background jobs.
8. Role-based and cross-agency denial acceptance using approved synthetic records before external users or PHI are enabled.

## Versioned changes currently tracked

- `001`–`014`: business schema, access, notes, visit execution, financials, contracts, and scheduling.
- `015` and `015a`: Auth.js session foundation and caregiver profile-role reconciliation.
- `016`, `016a`, `016b`, and `016c`: background jobs, runtime access, recurring-series idempotency, and notification-returning correction.
- `017`: website lead integration.
- `018`: visit lifecycle integrity; explicit care execution replaces time-derived completion.

Update this register whenever a new migration, provider-boundary change, or application data contract changes what a future production import must create, transform, exclude, or verify.

