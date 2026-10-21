# Production Environment, Data Migration, and Release Promotion Plan

Status: design draft; no production action authorized  
Recorded: 2026-10-16

## Decision summary

Create the new production platform in its own Azure subscription and its own production service boundaries. Use a protected `production` branch in the existing Neon `Mycaresight-Platform` project, derived from its `environment-base` branch after verifying that the base is suitable for a schema-only production baseline. Reproduce the approved UAT architecture pattern, but create new identities, credentials, keys, storage accounts, monitoring resources, domains, and access assignments. Do not copy production data into UAT, and do not promote UAT data or secrets into production. This branch topology is the intended plan; the project-level access and HIPAA gates below must be verified before importing data.

Migrating the current production workload before starting multi-location and mobile implementation is reasonable. Production currently has real agencies but no agency administrators, care coordinators, or caregivers, so the identity and workflow cutover is simpler now than after external use begins. The migration must still preserve real agency data and satisfy the same PHI and audit controls as a populated system.

The current practice of copying local files from a development folder to a production folder and manually running whichever migrations appear missing should be retired. It cannot prove exactly what code or schema was released, can omit deletions and generated changes, and makes rollback and audit reconstruction unreliable. Production should receive an immutable Git commit and an explicit, checksummed migration manifest through an approved pipeline.

## Scope and non-goals

This document plans:

- an isolated Azure/Neon/Blob/Auth.js production target;
- reconciliation and migration from the live Supabase/Vercel production source;
- a repeatable UAT-to-production code-promotion process;
- controlled database migrations, verification, rollback, and release evidence; and
- the gates required before production data or users enter the new environment.

It does not authorize Azure provisioning, database access, production schema changes, data export/import, DNS changes, credential rotation, deployment, or cutover. Those require separately approved implementation and runbooks after live discovery.

## Target production boundary

Use a dedicated Azure subscription, for example `MyCareSight-Prod`, with production-only owners, operators, budgets, policy, and audit. Environment isolation should include:

| Capability | Production requirement |
|---|---|
| Azure organization | Dedicated production subscription and resource groups; least-privilege RBAC; break-glass access; budgets and security alerts |
| Web runtime | Production App Service Plan and App Service, system-assigned Managed Identity, health endpoint, staging slot where supported, custom domain/TLS, backup and restore procedure |
| Secrets and encrypted fields | Dedicated Key Vault, new production key material, soft delete and purge protection, Managed Identity read access only, separated key administrators, diagnostics and recovery ownership |
| Database | Protected `production` branch under `Mycaresight-Platform`, created from `environment-base` using schema-only branching where available; its own compute endpoint and production-only credentials and roles; region chosen for application latency and data requirements; pooling, TLS, PITR/backups, restricted grants, and RLS defense in depth |
| Object storage | Dedicated private Azure Storage account/containers, Managed Identity access, no public blobs, lifecycle/retention controls, integrity manifest, diagnostics, and tested recovery |
| Observability | Production-only Application Insights/Log Analytics, PHI-redacted telemetry, availability alerts, security alerts, retention policy, and audited operator access |
| Delivery | GitHub `production` environment with required reviewers, environment-scoped values, OIDC federated only to the production subscription/resource group, protected tags/branches, and concurrency controls |
| External services | Production-specific email, bot protection, DNS, and future notification credentials after data-flow and BAA review |

Architecture can be reproduced from UAT infrastructure definitions and operating knowledge, but resource identifiers and secret values must be generated independently. The existing UAT workflow at [`.github/workflows/main_mycaresight-uat.yml`](../../.github/workflows/main_mycaresight-uat.yml) is evidence for build and Azure OIDC patterns, not a production workflow to copy unchanged.

The sensitive-key production gate in [`docs/operations/sensitive-data-key-management.md`](../operations/sensitive-data-key-management.md) and the reconciliation requirements in [`docs/migrations/future-production-port-impact-register.md`](../migrations/future-production-port-impact-register.md) are mandatory inputs.

### Neon branch boundary and schema promotion

Create `production` as a child of `environment-base`; verify the existing `development` and `UAT` parent relationships in the Neon console rather than assuming them. Branch creation takes a point-in-time copy of the parent's schema and, by default, its data. Choose schema-only creation for `production` if the console supports it, and verify the resulting branch contains no inherited agency, account, session, audit, or other operational rows before any import. Do not infer that `environment-base` is empty from its name. If schema-only creation is unavailable, verify the base contains no operational data before branching or stop and choose a clean schema baseline.

After creation, changes to `environment-base` do not automatically update `production`. Do not reset or recreate `production` from the base after real data is imported. Deliver the same immutable, checksummed SQL migrations independently to development, UAT, and production, with the target branch identity verified before each application. Advance the clean `environment-base` template to the released schema only after the production migration succeeds. Neon schema diff can support verification, but it does not replace the migration ledger.

Branch data and compute are isolated, while project membership and administrative controls remain shared. Limit project Editor/Admin membership and Neon API keys to trusted production operators; avoid automation credentials that can create data-bearing branches of production. Confirm that the Neon BAA and HIPAA-eligible configuration cover the existing project before any PHI is imported. Protect the production branch against reset/deletion, use production-specific database roles and passwords, and confirm restore and retention settings. If branch protection or adequate project-level access control is unavailable, revisit a separate Neon production project before importing data.

## Canonical source and environment policy

Adopt one canonical Git repository and immutable source history for development, UAT, and production. A long-lived production repository that receives copied local files should not remain the release mechanism.

Preferred flow:

1. A reviewed pull request creates a deployable commit on the protected release branch, normally `main`.
2. CI installs from the lockfile and runs type checking, lint, tests, build, migration lint/preflight, and secret scanning.
3. UAT deploys the exact commit SHA and records it as the release candidate.
4. UAT acceptance approves that SHA, not a folder snapshot or a later branch state.
5. A manually approved production workflow builds from or deploys the same SHA, uses only production environment configuration, applies the release's exact migration manifest, deploys to a production staging slot, runs synthetic smoke checks, and swaps/releases after approval.
6. The release record stores source SHA, tag, build ID/artifact digest, migration checksums, target environment identity, approvers, timestamps, verification results, and rollback decision.

Use a protected release tag such as `prod-YYYY.MM.DD.N` after UAT approval. A tag must point to the tested SHA and must not be moved.

If repository consolidation cannot happen immediately, the temporary alternative is an automated Git mirror or pull request that transfers an exact tagged commit between repositories and verifies the resulting tree hash. Manual filesystem copying is not an acceptable ongoing path.

Environment-specific public variables can be injected while building from the same SHA. Reuse a binary artifact only after verifying that the Next.js output contains no environment-specific public value that differs between UAT and production; otherwise build separately from the same SHA and record both artifact digests.

## Database migration control

Replace the concept of manually finding “missing scripts” with a migration ledger and release manifest:

- ordered, immutable migration files in source control;
- a database migration ledger recording migration ID, checksum, application time, and release identity;
- one release manifest listing the exact migrations expected for that release;
- preflight checks that compare filesystem migrations, ledger rows, checksums, dependencies, target database identity, current schema, and free-space/lock risks;
- a dedicated privileged migrator identity that the web runtime and background-job identities cannot assume;
- transactional migrations where PostgreSQL permits them, explicit timeouts, and reviewed expand-and-contract steps for high-risk changes;
- post-migration catalog, grant, RLS, row-count, and application smoke verification; and
- immutable applied migrations, with corrections delivered as new files.

Code should remain backward compatible while additive schema changes roll out. Destructive contract steps occur only in a later release after old code is absent and data reconciliation is complete. Code rollback can use the previous slot/artifact; database rollback should normally be a reviewed forward correction. PITR restore is a disaster-recovery action that requires a defined recovery point and data-loss decision, not a routine migration undo.

## Production source and target discovery

Before designing SQL or moving rows:

1. Inspect the live production Supabase schema, constraints, functions, triggers, RLS, grants, storage metadata, authentication identities, and row volumes through approved read-only access.
2. Inspect the live target Neon schema and migration ledger through approved read-only access.
3. Compare the separate production repository with the tested UAT source at the commit and behavior levels.
4. Classify every table and object as `import`, `transform`, `recreate empty`, or `exclude`, using the existing production impact register.
5. Document identity collisions, role/membership state, case-insensitive email duplication, orphan relationships, legacy statuses, reference-value mappings, storage-key mappings, retention requirements, and rejected-row handling.

The current live Supabase source is authoritative. Migration files and UAT data must not be treated as a substitute. If either live-schema connection is unavailable, database-specific planning stops until it can be verified.

## Data migration sequence

### Gate 1: production infrastructure and compliance readiness

- Confirm BAAs and service eligibility for every provider that will store, process, transmit, back up, log, or monitor production data.
- Complete the HIPAA/security checklist, access review, incident response, logging redaction, retention, backup, restore, key recovery, vulnerability, and dependency gates.
- Provision production identities and secrets independently; verify that UAT principals cannot reach production and production principals cannot reach UAT.
- Validate private Blob access, Key Vault retrieval, restricted Neon roles, forced RLS where applicable, health monitoring, alerts, and recovery with synthetic data only.

### Gate 2: source freeze and migration baseline

- Establish the canonical repository and a production candidate SHA.
- Reconcile all source/target schema differences and approve the per-table disposition and transformation rules.
- Decide how current production platform administrators authenticate after cutover. Do not migrate Supabase sessions. Prefer controlled invitations/password resets into Auth.js and revoke old sessions at cutover.
- Define the change-freeze or change-capture window. With no external agency users, a planned maintenance window and final delta may be safer than building complex dual-write replication.

### Gate 3: rehearsal

- First validate schema creation and application behavior with synthetic data.
- Then perform at least one production-data rehearsal in an approved, isolated, HIPAA-ready migration environment inside the production boundary.
- Transfer data with controlled tools that avoid PHI in terminals, CI logs, GitHub artifacts, local files, or error monitoring.
- Migrate private objects through the application-owned storage boundary or an approved migration utility. Reconcile database references, object counts, sizes, and bounded integrity hashes without exposing content.
- Reconcile row counts, relationships, sequence values, reference mappings, financial aggregates, visit states, document manifests, audit retention, and rejected rows.
- Time every phase and prove rollback/restore within the approved recovery objectives.

### Gate 4: cutover

- Take and verify source and target recovery points.
- Enter the approved maintenance/read-only window and stop source mutations and target background jobs.
- Apply the final schema manifest, migrate the final full or delta data set, reconcile it, and initialize operational tables that must start empty.
- Deploy the approved application SHA to the production staging slot and run synthetic role, tenant-denial, storage, authentication, and critical-workflow checks.
- Switch DNS/traffic only after the named go/no-go approvers accept database, object, authorization, and application evidence.
- Keep the old platform read-only and available for the approved rollback window. Do not immediately delete it or its backups.

### Gate 5: stabilization and decommissioning

- Closely monitor authentication, authorization denials, database errors, latency, jobs, storage, email, audit writes, and resource budgets without recording PHI.
- Reconcile scheduled daily counts and high-value aggregates for the stabilization period.
- Resolve or forward-correct discrepancies under change control.
- Decommission the old production environment, revoke its credentials, and complete disposal/retention evidence only under a separate approved runbook.

## Minimum release pipeline

The first production-capable pipeline should include:

1. **Validate:** checkout an exact SHA, `npm ci`, typecheck, lint, unit/regression tests, production build, dependency/secret checks, and standalone artifact verification.
2. **Migration preflight:** prove the target subscription/project/database identity, check the ledger and manifest, create/verify recovery point, and require the production environment approval.
3. **Migrate:** connect as the migrator identity, apply only pending checksummed migrations, and run post-migration verification.
4. **Stage:** deploy the exact source SHA/artifact to a production staging slot using GitHub OIDC and production environment values.
5. **Verify:** run no-PHI health, authentication, authorization-denial, database, storage, and critical synthetic workflow checks.
6. **Release:** require a final approval and swap/release the staging slot.
7. **Observe:** run bounded post-release checks and write the release evidence record. Automatic rollback may address a failed web health check; database/data failures require the declared incident and recovery decision.

The production workflow must assert the expected production Azure subscription ID and resource names before every mutation, just as the UAT workflow currently asserts its UAT subscription.

## Acceptance and rollback gates

Production cutover is blocked unless all of the following have named evidence:

- live source and target schema comparison;
- complete table/object disposition and transformation mapping;
- zero unexplained orphan, tenant, identity, membership, or storage-reference discrepancies;
- exact code SHA and migration manifest;
- successful restore rehearsal and documented recovery time/recovery point objectives;
- cross-agency denial, inactive/invited/pending membership denial, privileged-role, and caregiver access tests with synthetic identities;
- private storage and signed-URL authorization verification;
- audit generation without PHI payloads;
- monitoring and alert delivery to approved operators;
- current BAA/security/operational approvals; and
- a signed go/no-go and rollback authority list.

Rollback triggers should be numerical and time-bound before cutover: authentication failure rate, critical workflow failure, unexplained reconciliation variance, cross-tenant access, missing objects, or data corruption. A suspected tenant-isolation failure is an immediate stop/rollback and security incident.

## Sequence relative to deferred product work

1. Finish UAT deployment and acceptance gates needed to establish a stable release candidate.
2. Implement the canonical Git and migration-promotion controls.
3. Provision and validate the isolated production platform.
4. Rehearse and execute the separately approved production migration.
5. Complete the production stabilization gate.
6. Implement agency multi-location through the new release process.
7. Reassess and implement mobile integration on top of location-aware authorization and assignment logic.

This order avoids building location and mobile behavior twice across the old and new backends. It also avoids importing production data into a synthetic UAT environment.

## Decisions required before implementation

1. Confirm the dedicated production Azure subscription name, billing owner, security owners, break-glass owners, region, and resource naming convention.
2. Confirm the `Mycaresight-Platform` production branch, its region, plan, branch protection, project membership, PITR/retention requirements, and BAA status.
3. Choose the canonical GitHub repository and protected release branch. Decide whether the existing production repository can be retired after history and configuration reconciliation.
4. Approve the production workflow model: same tested SHA, GitHub production environment reviewers, release tags, migration ledger, staging slot, and explicit go/no-go.
5. Approve the maintenance-window strategy versus change-data capture after live volume and write-rate discovery. Given the absence of external agency users, a bounded maintenance window is the preferred starting assumption.
6. Define recovery objectives, rollback window, old-platform retention, and decommissioning authority.
7. Approve production-data discovery access before any schema-specific SQL, export, rehearsal, or transfer work begins.

## Immediate next planning slice

After these decisions are approved, the next slice should remain read-only and produce:

- a live production/UAT repository and schema delta report;
- a production resource inventory and responsibility matrix;
- a per-table and per-object migration disposition;
- a code-promotion workflow design with exact GitHub environments and Azure identities;
- a migration-ledger design compatible with the existing numbered SQL; and
- rehearsal, cutover, verification, rollback, and stabilization runbooks.

No production data should move until those artifacts and the infrastructure/compliance gates are approved.

