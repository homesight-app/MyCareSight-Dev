# Database Migration Control

Status: Phase 2 transactional apply runner prepared locally. It is not connected to a GitHub environment or enabled in any deployment workflow.

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
- `npm run db:migrations:validate` performs offline filename, manifest, checksum, target-scope, verifier, and transaction-control checks.
- `npm run db:migrations:status` performs the same validation, verifies the exact Neon branch and restricted login role, assumes the shared owner only inside a transaction, and reads migration-ledger metadata.
- `npm run db:migrations:apply` runs approved pending migrations and their verifiers in one transaction, under the shared schema owner. It serializes concurrent runners, fails on target or checksum drift, and records ledger evidence before commit.

The apply command is available for controlled operator rehearsal but is not yet called by GitHub Actions. There is no automatic baseline command: legacy baseline evidence requires human review and a separately approved insert.

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

## GitHub enablement gate

Do not call `db:migrations:apply` from automatic UAT or protected staging/production jobs until:

1. the runner tests and offline validation pass;
2. the ledger ownership repair is verified where an existing ledger needs it;
3. a no-op status/apply rehearsal succeeds first in Development and then UAT with exact branch IDs;
4. each GitHub environment has a separate migrator URL secret and non-secret expected host, database, and branch ID;
5. the workflow proves database migration completes before deployment of the same SHA;
6. recovery points and failure handling are exercised; and
7. production reviewer controls are revisited after cutover.

The intended promotion policy remains automatic UAT migration after merge, manual environment-gated staging migration, and protected manual production migration. Database migration must complete and verify before the matching application SHA is deployed.
