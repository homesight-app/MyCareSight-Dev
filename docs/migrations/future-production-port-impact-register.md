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
| ADL/IADL plan day key | Migration 027 restores the Neon `patient_care_plan_tasks` unique index on `(patient_id, legacy_task_code, day_of_week)` required by the non-skilled plan save. The user verified that live Supabase has this index, UAT Neon lacks it, and UAT has zero duplicate key groups. | Verify the live source and target definitions and duplicate counts again at the production migration gate. Apply and verify 027 on the target Neon branch before importing production care-plan rows or enabling saves. Do not change Supabase production in the UAT repair. | Operator reports Development and UAT verifiers `key_ok=true`, `duplicate_groups=0`; UAT ADL and IADL save/refresh accepted. Baseline promotion pending. |
| System settings key | Migration 028 reconciles exact duplicate Neon `system_settings` rows and restores the source `(category, key)` primary key required by settings upserts. The operator found four three-row groups on Neon Development and confirmed every group contained one complete-row version. | Import or recreate production settings only after mapping storage paths and environment-specific values. Do not copy synthetic branding paths or UAT settings into production. | Operator reports verifier `key_ok=true`, `duplicate_groups=0` on Development, UAT, `environment-base`, and protected production; no agent-connected verification. |
| Additional upsert keys | Migration 029 adds source-equivalent unique indexes on `agency_configurations(agency_id)`, `agency_lead_stages(agency_id, key)`, and `patient_lead_details(lead_id)`. Existing Neon writes use these `ON CONFLICT` targets. | Verify target definitions again before importing source data or enabling corresponding writes. Branch-specific duplicate checks can reject a conflicting target without deleting rows. | Operator reports verifier `key_ok=true`, `duplicate_groups=0` for all three on Development, UAT, `environment-base`, and protected production; synthetic UAT workflow acceptance remains. |
| Certification categories | The Neon application writes `licenses.category_id`; the removed legacy `certification_category` column is no longer used. | Inspect production `licenses` and configuration values. If production stores category text or a different identifier, map it to stable target configuration codes/IDs and validate unmatched values. | Transformation may be required. |
| Users and roles | Auth.js uses `user_profiles`, active agency memberships, current roles (`admin`, `expert`, `company_owner`, `care_coordinator`, `staff_member`), and Neon-backed opaque sessions. Migration 019 makes matching domain role rows the synchronized source for `user_agency_roles`; migration 021 removes historical memberships that no longer match the profile's current role/agency or a current domain role row and strengthens future cleanup. Legacy `agency_admin` is a table/domain label, not an accepted session role. | Build a deterministic identity and membership mapping. Detect case-insensitive duplicate emails, inactive accounts, legacy role values, duplicate or unexpected memberships, source/profile role disagreements, and source/membership status disagreements before enabling logins. Apply and verify the target constraints/triggers before importing identities. Preserve `pending` and `invited` as non-login states and do not infer activation from a password hash. Do not assume Supabase Auth credential hashes are portable to the Auth.js password format. | Identity/credential migration decision remains unresolved; migrations 019 and 021 plus their verification are required. |
| Sessions and recovery | Migration 015 introduced Auth.js sessions, password-reset tokens, rate-limit events, Argon2id credentials, and session-revocation behavior. | Do not carry live Supabase or UAT sessions into the new production environment. Reset/recovery and rate-limit operational rows should start clean unless a later security review requires a narrowly defined carryover. | Recreate empty; user credential transition remains unresolved. |
| Caregivers and profile-role reconciliation | Migration 015a reconciles caregiver profile roles and active membership behavior. | Validate every production caregiver profile against its caregiver membership and agency. Reject or quarantine ambiguous cross-agency or unlinked identities rather than guessing. | Validation/transformation required. |
| Visits and schedules | Migrations 010, 014, 016b, and 018 define caregiver execution, manager scheduling, recurring-series idempotency, and explicit visit lifecycle behavior. Migration 018 does not rewrite existing rows. | Import source statuses exactly only after enumerating production values. Reconcile null, legacy, or time-derived statuses before enabling jobs. Preserve explicit `completed`, `missed`, `cancelled`, `voided`, `on_hold`, and `in_progress` decisions. Validate caregiver, patient, address, contract, task, and series foreign keys. | Status audit and possible transformation required. |
| Open-shift outreach | Migration 020 adds durable visit campaigns, recipient responses, assignment-request links, automatic closure, PHI-minimized notifications, and active caregiver/membership eligibility. | Create and verify the target tables, policies, triggers, and grants before enabling outreach. Do not copy synthetic UAT campaigns, recipients, or notifications. Any production outreach history requires a separate source inventory and retention decision. | Recreate operational outreach tables empty unless later retention review requires an approved import. |
| Client and caregiver skill matching | Migration 022 separates required eligibility skills from preferred ranking skills. Migration 023 restores the one-row-per-client key. Migration 024 normalizes catalog references, caregiver skill verification, client requirement levels, category data, and system/agency catalog scope while retaining text arrays as compatibility mirrors. | Inspect live production client and caregiver skill strings before import. Build a reviewed name-to-catalog-ID mapping, quarantine ambiguous values, preserve required/preferred intent, and decide which caregiver claims can be imported as verified. Do not infer verification from free text. Preserve agency ownership for future custom skills. | Transformation and verification decision required; apply and verify 022–024 before importing skill records. |
| Visit financials and payroll | Migrations 009–013 enforce manager/caregiver access and atomic approval/void behavior. Application reports now exclude pending/voided rows and calculate overtime using complete work weeks. | Preserve approved/voided history and frozen financial snapshots. Validate numeric precision, work-week configuration, effective-dated pay rates, contracts, approvals, adjustments, mileage, and completed-visit linkage before comparing totals. | Import with reconciliation; no UAT financial rows. |
| Background jobs | Migration 016 and follow-ups introduced job runs, items, outbox, idempotency, visit refill discovery, and notification dispatch. | Import durable business records that jobs inspect, then initialize operational job ledgers deliberately. Do not copy UAT job runs, queue items, or outbox state. Prevent jobs from running until row reconciliation and idempotency checks pass. | Recreate operational tables empty; startup gate required. |
| Website lead integration | Migration 017 introduced credential, delivery, idempotency, and rate-limit tables. Leads enter the existing agency lead structure with source `Website`. | Import production leads according to the normal lead mapping. Do not copy UAT integration secrets, delivery attempts, or rate-limit events. Create new production credentials after the target security boundary is approved. | Business leads import; integration operational/security rows excluded or recreated. |
| Documents and branding | UAT storage moved behind the application-owned Azure Blob boundary with private containers and server-authorized object keys. | Database document records and Blob objects require a coordinated manifest. Preserve record ownership and object-key relationships, verify object counts/size hashes without logging PHI, and issue no public URLs. Supabase Storage paths cannot be assumed to equal Azure object keys. | Separate controlled object transfer and reference reconciliation required. |
| Audit history | Neon mutations create identifier-only audit records and avoid PHI content. | Decide which production audit history is legally and operationally required, validate its source shape, and import it append-only. Never place audit exports or PHI-bearing content in GitHub or CI logs. | Retention/legal decision required before import. |
| Reference/configuration data | Configurable lists use stable codes where logic depends on the value; UAT includes synthetic setup data. | Import approved production reference values or seed reviewed canonical values. Never copy synthetic UAT identifiers blindly when business rows reference different production IDs. | ID/code mapping required. |
| Feature Plans | The Neon target replaces legacy menu-feature rows with six stable capabilities. Live production was verified to contain zero Feature Plans, zero plan-feature rows, and zero agencies assigned to a plan. | Retain the six canonical capability rows, start `feature_plans` and `plan_capabilities` empty, leave agency plan assignments null, and create and assign real plans through the new workflow after migration. Do not promote staging test plans. | Recreate empty; no legacy plan transformation is required based on the verified source counts. |
| Runtime identities and permissions | Neon uses separate restricted `mycaresight_app` and `mycaresight_jobs` roles; migration owners remain separate. | Roles, grants, RLS, secrets, and connection strings are infrastructure and must be recreated. They are not database rows to copy from UAT. | Recreate and verify independently. |
| Personnel private identifiers | Migration 026 adds tenant-scoped personnel DOB, hire date, address, masked SSN suffix, and versioned application-encrypted SSN envelopes. Azure environments use separate Key Vault secrets through Managed Identity. | Inspect the live source for agency-person and caregiver identifiers only after production migration planning is authorized. Never copy UAT keys or synthetic private records. Re-encrypt approved source SSNs into the Production environment context and reconcile existing key-staff/person links before enabling access. Production also needs its own vault, key, workload identity, RBAC, application settings, private networking, diagnostics, recovery, and rotation ownership. | Separate key creation, infrastructure gate, field mapping, controlled re-encryption, and access acceptance required. |

## Rows that should not be copied from UAT

The future production import must use the live production source, not UAT data. In particular, do not promote UAT values from:

- `auth_sessions`, `password_reset_tokens`, or `auth_rate_limit_events`;
- `background_job_runs`, `background_job_items`, or `background_job_outbox`;
- `lead_integration_credentials`, `lead_integration_deliveries`, or `lead_integration_rate_limit_events`;
- synthetic agencies, users, patients, caregivers, visits, leads, documents, certifications, contracts, rates, notes, or audit events;
- UAT Blob objects, secrets, connection strings, or runtime-role passwords.

## Personnel encryption Production gate

Production is not configured or authorized by the UAT implementation. Before a
future Production port enables personnel SSNs or another field-level encrypted
data class:

1. Create a dedicated Production Key Vault with Azure RBAC, 90-day soft delete,
   purge protection, approved backup/recovery, diagnostic export, and security
   alerts.
2. Generate new Production AES-256 key material. Do not promote a Development or
   UAT secret or ciphertext.
3. Give the Production application identity only `Key Vault Secrets User` on the
   Production vault. Keep secret-version writers and access administrators as
   separate operator roles.
4. Configure Production-specific `SENSITIVE_DATA_*` settings and private
   App-Service-to-vault networking. If Production remains outside Azure App
   Service, review and approve a workload-identity provider before migration;
   App Service Managed Identity cannot be assumed.
5. Apply and verify migration 026, inventory the live source under an approved
   production-data plan, and re-encrypt approved values into the Production
   environment context through an audited server operation.
6. Complete synthetic authorization, cross-tenant denial, tamper, old-version,
   recovery, and rotation acceptance before real records are exposed.

The operational procedure and rotation rules are in
[`docs/operations/sensitive-data-key-management.md`](../operations/sensitive-data-key-management.md).

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
- `019`: agency-role synchronization, membership integrity constraints/backfill, and restricted runtime writes.
- `020`: PHI-minimized open-shift campaigns, caregiver responses, assignment-request linkage, and automatic closure.
- `021`: historical agency-membership drift cleanup and stronger profile role/agency cleanup.
- `022`: client required/preferred caregiver skill matching and manager-only requirement access.
- `023`: one-row-per-client caregiver-skill requirement integrity and atomic-upsert key.
- `024`: normalized searchable skill catalog, caregiver verification, client requirement references, and agency-ready catalog scope.
- `025`: normalized capability-based feature plans and server-enforced agency entitlements.
- `026`: tenant-scoped agency personnel private details and versioned application-level SSN encryption metadata.
- `027`: ADL/IADL patient day-key integrity.
- `028`: exact-duplicate system-settings reconciliation and composite primary-key restoration.
- `029`: three source-equivalent keys for agency configuration, agency lead stage, and patient lead detail upserts.

Update this register whenever a new migration, provider-boundary change, or application data contract changes what a future production import must create, transform, exclude, or verify.

