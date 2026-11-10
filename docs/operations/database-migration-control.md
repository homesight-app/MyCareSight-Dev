# Database Migration Control

Status: Phase 3 UAT workflow gate prepared locally. Development and UAT operator rehearsals passed; the workflow change is not deployed until its environment configuration is completed and the reviewed branch is merged.

Development ownership-bootstrap acceptance completed on 2026-11-03. The final verifier passed every role, membership, ownership, extension, and runtime-isolation assertion. A direct `psql` login as `mycaresight_migrator` successfully used explicit `SET LOCAL ROLE mycaresight_schema_owner`, and the synthetic application smoke test passed. Migrations 038 through 040 were subsequently applied and verified manually in Development and UAT; GitHub database-writing automation remains disabled.

The Neon Functions deployment guide is not the schema-migration mechanism for this application. The relevant Neon pattern is isolated branch testing through GitHub Actions. MyCareSight adds environment-scoped credentials, immutable checksums, an append-only ledger, exact target validation, and gated staging/production promotion. A Neon API key is needed only if later automation creates or deletes preview branches; fixed-environment migrations use the dedicated PostgreSQL migrator connection.

## One-time ownership bootstrap

`scripts/database-bootstrap/001-schema-owner-bootstrap.sql` is an owner-run prerequisite, not a managed application migration. It creates the `NOLOGIN` shared owner `mycaresight_schema_owner`, grants membership only to `neondb_owner` and the restricted `mycaresight_migrator`, and transfers non-extension application relations and routines in `public`. It deliberately leaves the database, `public` schema, and extension objects under their existing Neon ownership. Run its verifier before and after a Development rehearsal. Do not run migration 038 until the verifier passes and the security-definer regression checks succeed.

Future migration transactions must use `SET LOCAL ROLE mycaresight_schema_owner`. The ledger records `session_user` as the credential identity and `current_user` as the execution role.

If the Development rehearsal reveals a regression after commit, run `001-rollback-schema-owner-bootstrap.sql` as `neondb_owner`. It reverses only the scoped application-object ownership and migrator membership; it leaves the inert shared role available for diagnosis and retry.

## Purpose

The migration-control boundary replaces manual guesses about missing SQL with an ordered, checksummed manifest and an append-only database ledger. It is provider-neutral and uses the existing PostgreSQL driver. It must never log connection strings, database contents, PHI, or SQL result data beyond migration metadata.

## Files and commands

- `scripts/database-migrations/manifest.json` records the immutable legacy inventory digest and managed migrations beginning with 038.
- `scripts/migrations/038-database-migration-ledger.sql` creates the append-only ledger.
- `scripts/migrations/038-verify-database-migration-ledger.sql` verifies the ledger structure and least-privilege grants.
- `scripts/migrations/039-scope-membership-session-revocation.sql` is the first post-ledger application migration. It scopes agency-role synchronization and session revocation to actual authorization changes; its verifier and emergency rollback are documented in `docs/migrations/uat-membership-session-revocation.md`.
- `scripts/migrations/040-agency-managed-caregiver-credentials.sql` is Development/UAT-only. It auto-verifies synthetic pending skill rows, removes caregiver write policies, and adds manager-scoped RLS to caregiver certifications while retaining caregiver self-read access.
- `scripts/migrations/041-production-safe-caregiver-credential-policies.sql` converges every environment on caregiver self-read and agency-manager-only writes without approving, deleting, or otherwise rewriting skill or credential rows. It is the production-safe policy counterpart to the synthetic data conversion in migration 040.
- `scripts/migrations/042-production-reference-data.sql` seeds only reviewed, non-tenant platform reference data in production-staging and Production: six capabilities, 15 task categories, 80 care tasks, four configuration types with 35 values, 27 system skills, 10 unrated billing codes, and six validation rules. It excludes license types, pricing, task-credential links, test credentials, Feature Plans, tenant records, authentication state, operational history, and environment configuration.
- `npm run db:migrations:validate` performs offline filename, manifest, checksum, target-scope, verifier, and transaction-control checks.
- `npm run db:migrations:status` performs the same validation, verifies the exact Neon branch and restricted login role, assumes the shared owner only inside a transaction, and reads migration-ledger metadata.
- `npm run db:migrations:apply` runs approved pending migrations and their verifiers in one transaction, under the shared schema owner. It serializes concurrent runners, fails on target or checksum drift, and records ledger evidence before commit.

The UAT workflow now calls the apply command after application validation/build and Azure subscription verification, but before deploying the matching application SHA. There is no automatic baseline command: legacy baseline evidence requires human review and a separately approved insert.

The manual production-staging workflow uses the same fail-closed ordering. It
validates and builds the selected `main` commit, verifies the Azure subscription
and exact App Service staging slot, applies and verifies database migrations for
that same SHA, and only then deploys the prepared artifact. The workflow remains
manual and bound to the protected `production-staging` GitHub environment.

## UAT GitHub environment configuration

Before merging the UAT workflow gate, create or review the GitHub environment named `uat`. It should allow deployment only from `main`. Add these values directly to that environment; do not paste their values into issues, pull requests, workflow logs, or repository files:

- Environment secret `UAT_DATABASE_MIGRATION_URL`: the direct Neon connection for `mycaresight_migrator`, distinct from the application runtime URL.
- Environment variable `UAT_MIGRATION_EXPECTED_HOST`: the exact hostname in that migrator URL.
- Environment variable `UAT_MIGRATION_EXPECTED_DATABASE`: `neondb`, unless the approved UAT database is explicitly renamed.
- Environment variable `UAT_MIGRATION_EXPECTED_BRANCH_ID`: the exact UAT `br-...` identifier verified during rehearsal.

Existing UAT application and Azure deployment secrets must remain available to the `uat` environment. Environment secrets override repository secrets with the same name. UAT is intentionally automatic after merge and therefore does not require a reviewer; staging and production retain their manual/protected promotion boundaries.

On a `main` push the single UAT job checks out one commit, tests and builds it, authenticates to the approved Azure UAT subscription, runs migration `status`, `apply`, and `status` with `MIGRATION_RELEASE_SHA=${{ github.sha }}`, then deploys that already-built artifact. If target validation, migration SQL, verifier evaluation, or ledger recording fails, the application deployment step is not reached.

## Production-staging GitHub environment configuration

The `production-staging` environment must retain its `main`-only deployment
branch restriction and existing Azure/App Service values. Add the following
database migration values directly to that environment:

- Environment secret `STAGING_DATABASE_MIGRATION_URL`: the direct, non-pooled
  Neon connection for the production-staging `mycaresight_migrator` login.
- Environment variable `STAGING_MIGRATION_EXPECTED_HOST`: the exact hostname in
  that migrator URL.
- Environment variable `STAGING_MIGRATION_EXPECTED_DATABASE`: `neondb`, unless
  the approved database has explicitly been renamed.
- Environment variable `STAGING_MIGRATION_EXPECTED_BRANCH_ID`: the exact
  production-staging Neon branch identifier (`br-cool-math-akloyox0` at the
  time of the controlled rehearsal).

Do not reuse the UAT or production migrator credential. The first accepted run
should show migration 041 as pending, apply it with the workflow commit SHA,
verify it, and deploy that same SHA. A later no-op run must report no pending
migrations and no checksum mismatches.

## Production GitHub environment configuration

The protected `Production` environment must keep its existing `main`
restriction, wait timer, Azure OIDC values, and application secrets. Add these
database migration values directly to that environment:

- Environment secret `PRODUCTION_DATABASE_MIGRATION_URL`: the direct,
  non-pooled Neon connection for the Production `mycaresight_migrator` login.
- Environment variable `PRODUCTION_MIGRATION_EXPECTED_HOST`: the exact hostname
  in that migrator URL.
- Environment variable `PRODUCTION_MIGRATION_EXPECTED_DATABASE`: `neondb`,
  unless the approved database has explicitly been renamed.
- Environment variable `PRODUCTION_MIGRATION_EXPECTED_BRANCH_ID`: the exact
  Production Neon branch identifier (`br-raspy-sound-akbjvszs` at the time of
  the controlled bootstrap).

The manual Production workflow takes an approved `release_sha`, proves that
exact SHA is on `main` and passed the manual production-staging workflow, builds
it, verifies the Azure Production target, runs migration `status`, `apply`, and
`status` with `MIGRATION_RELEASE_SHA` set to that input SHA, and only then
deploys and health-checks the application. Do not substitute `github.sha` for
the approved input: a manual run can be launched from a newer `main` commit than
the release being promoted.

## Legacy boundary

Migrations through 037 predate the ledger and were applied manually. The legacy inventory checksum proves whether those repository files change after this baseline; it does not claim that every optional corrective or environment seed ran in every branch.

Before recording `037-baseline-legacy-state` in any database:

1. Confirm the connection identifies the intended Neon branch and database.
2. Run all applicable legacy verifier scripts for that environment.
3. Record any intentionally excluded corrective or environment-only script in the baseline evidence.
4. Resolve every failed or unexplained verifier; do not mark the baseline complete merely to advance deployment.
5. Review the generated status report without including row content or credentials in GitHub artifacts.

Migration 037 is staging reference data. It is part of the immutable repository inventory but is not authorization to seed production. Synthetic migration 003 is excluded from automated inventory and must never run against production.

## Read-only status configuration

Set these values only in the intended shell or protected GitHub environment:

- `DATABASE_MIGRATION_URL`: a dedicated migration-owner connection, never the runtime application URL.
- `MIGRATION_ENVIRONMENT`: `development`, `uat`, `production-staging`, `production`, or `environment-base`.
- `MIGRATION_EXPECTED_HOST`: the exact hostname from the approved target connection.
- `MIGRATION_EXPECTED_DATABASE`: the expected PostgreSQL database name.
- `MIGRATION_EXPECTED_BRANCH_ID`: the exact `br-...` Neon branch identifier from the approved target.
- `MIGRATION_RELEASE_SHA`: full lowercase 40-character Git commit SHA required by `apply` and recorded with newly applied rows.

The command compares the URL hostname and database before connecting, then verifies `current_database()`, `neon.branch_id`, and `session_user=mycaresight_migrator`. It prints only counts, migration IDs, and checksum state; it does not print credentials, SQL text, verifier row content, or application data.

## Controlled apply behavior

The runner opens one database transaction, takes a transaction-scoped advisory lock, and uses `SET LOCAL ROLE mycaresight_schema_owner`. For each pending migration it executes the immutable SQL, evaluates its declared verifier expectations, and inserts the ledger row in that same transaction. Any SQL error, false verifier assertion, nonzero required count, checksum mismatch, target mismatch, or ledger error rolls back the entire run.

If the ledger does not exist, the runner applies only migration 038 and stops. The reviewed `037-baseline-legacy-state` record must exist before it will apply 039 or later migrations. This prevents an automated job from treating the repository inventory checksum as proof that every legacy change ran in a target.

Ledgers that were created manually before this runner may still be owned by `neondb_owner`. Run `scripts/database-bootstrap/002-ledger-owner-repair.sql` once as `neondb_owner`, then require every assertion in `002-verify-ledger-owner-repair.sql` to be true. New ledgers created by the runner are already owned by `mycaresight_schema_owner` because migration 038 executes after the local role change.

## Managed migration rules

Beginning with migration 038:

- add every migration and verifier to `manifest.json`;
- never edit an applied migration; create a new corrective migration;
- use lowercase SHA-256 checksums;
- omit `BEGIN`, `COMMIT`, and `ROLLBACK` because the future runner will own the transaction;
- set local lock and statement timeouts in the migration;
- keep schema migrations environment-neutral;
- keep synthetic fixtures and environment-only seed data outside the managed production sequence;
- use expand-and-contract releases for destructive changes; and
- verify RLS, grants, constraints, and reference-data integrity without returning PHI.

Migration 039 is registered but must remain pending until migration 038 and the
approved legacy baseline have been recorded in the target environment. Its
presence in the manifest is not authorization to skip that gate or apply it to
all branches simultaneously.

Migration 041 is safe to apply after migration 040 or on an environment where
040 was intentionally skipped. It drops both legacy and manager policy names
before recreating one exact policy set, forces RLS on both qualification tables,
and makes no application-data changes. Existing `self_reported` rows remain
pending until an authorized agency manager reviews them.

Migration 042 is intentionally scoped to `production-staging` and `production`.
It reuses the canonical identifiers rehearsed in staging but separates safe
platform defaults from staging-only business/test configuration. Existing
canonical identifiers must match exactly or the migration rolls back. Missing
canonical rows are inserted, unrelated additional rows are not overwritten,
and a second execution is a no-op. License offerings, platform pricing, Feature
Plans, agencies, users, and operational records require separate business or
cutover decisions.

## GitHub enablement gate

Do not extend `db:migrations:apply` to protected staging or production jobs until:

1. the runner tests and offline validation pass;
2. the ledger ownership repair is verified where an existing ledger needs it;
3. a no-op status/apply rehearsal succeeds first in Development and then UAT with exact branch IDs (completed 2026-11-05);
4. the UAT GitHub environment is configured and its first automated no-op run is accepted;
5. each later GitHub environment has a separate migrator URL secret and non-secret expected host, database, and branch ID;
6. each workflow proves database migration completes before deployment of the same SHA;
7. recovery points and failure handling are exercised; and
8. production reviewer controls are revisited after cutover.

The intended promotion policy remains automatic UAT migration after merge, manual environment-gated staging migration, and protected manual production migration. Database migration must complete and verify before the matching application SHA is deployed.
