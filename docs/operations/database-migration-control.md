# Database Migration Control

Status: Phase 1 validation and read-only status tooling. Database-writing automation is intentionally disabled until every Neon branch has an approved baseline.

## Purpose

The migration-control boundary replaces manual guesses about missing SQL with an ordered, checksummed manifest and an append-only database ledger. It is provider-neutral and uses the existing PostgreSQL driver. It must never log connection strings, database contents, PHI, or SQL result data beyond migration metadata.

## Files and commands

- `scripts/database-migrations/manifest.json` records the immutable legacy inventory digest and managed migrations beginning with 038.
- `scripts/migrations/038-database-migration-ledger.sql` creates the append-only ledger.
- `scripts/migrations/038-verify-database-migration-ledger.sql` verifies the ledger structure and least-privilege grants.
- `npm run db:migrations:validate` performs offline filename, manifest, checksum, target-scope, verifier, and transaction-control checks.
- `npm run db:migrations:status` performs the same validation and then reads only database identity and migration-ledger metadata.

There is deliberately no `apply` or `baseline` command in Phase 1.

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

The command compares the URL hostname and database before connecting, verifies `current_database()`, and prints only counts, migration IDs, and checksum state. The target branch still requires operator verification because PostgreSQL database names can be identical across Neon branches.

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

## Phase 2 gate

Do not add `db:migrations:apply`, automatic UAT migration, or protected staging/production migration jobs until:

1. the Phase 1 validation workflow passes;
2. Development, UAT, production-staging, production, and environment-base baseline reports are reviewed;
3. the dedicated migrator role and separate environment secret names are approved;
4. recovery points and failure handling are documented; and
5. production reviewer controls are revisited after cutover.

The intended promotion policy remains automatic UAT migration after merge, manual environment-gated staging migration, and protected manual production migration. Database migration must complete and verify before the matching application SHA is deployed.
