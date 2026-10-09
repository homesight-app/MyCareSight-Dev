# UAT agency-role synchronization repair

Status: migration 019 and the matching atomic administrator update are prepared locally. The migration has not been applied to a Neon branch by Codex.

## Problem and scope

The Neon copy contains `user_agency_roles`, but it is missing the trigger function and source-table triggers that maintain the table. It is also missing the unique key, foreign keys, and role/status checks required by the historical backfill. Valid agency owners and caregivers can therefore have no matching active membership, causing administrator password reset to fail closed.

Read-only Development inspection on 2026-10-09 found no duplicate keys, orphaned rows, or invalid role/status values. It found one eligible agency-owner membership and three eligible caregiver memberships missing, plus one existing membership whose status no longer matches its source. Two source/profile role mismatches were intentionally excluded from automatic backfill to avoid granting a role that conflicts with the current identity profile. No names, email addresses, or record contents were queried.

## Migration behavior

`019-user-agency-role-sync.sql`:

- refuses a Supabase database and requires the current Neon identity/agency tables;
- fails before changes if duplicate, orphaned, or unsupported membership rows need manual reconciliation;
- adds the missing unique key, foreign keys, role/status checks, and lookup indexes;
- installs insert/update/delete synchronization triggers on `agency_admins`, `care_coordinators`, and `caregiver_members`;
- removes the previous primary membership when `user_profiles.role` or `agency_id` changes;
- backfills only source rows whose domain table agrees with `user_profiles.role`, and synchronizes source status;
- writes identifier/status-only audit evidence for memberships inserted or corrected by the backfill; and
- permits `mycaresight_app` to read memberships while blocking direct insert/update/delete. Source-table triggers perform writes as the migration owner.

The application update in `src/app/actions/users.ts` runs the profile update, domain-role synchronization, and identifier-only audit in one Auth.js actor-context transaction. A domain-role or audit failure now rolls back the profile update instead of leaving a partial identity.

## Run order

Use the direct Neon **owner** connection. The `mycaresight_app` runtime connection is expected to fail with `must be owner of table user_agency_roles`.

1. Apply to Development:

   ```powershell
   psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/019-user-agency-role-sync.sql
   ```

2. Verify Development:

   ```powershell
   psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/019-verify-user-agency-role-sync.sql
   ```

   Every boolean must be `t`; `duplicate_count` and `missing_or_stale_count` must both be `0`.

3. Repeat the unchanged migration and verification against the UAT owner connection.
4. Deploy the matching application build.
5. In UAT, use an approved synthetic active agency-owner account to set an administrator password and sign in. Then change a synthetic membership status and confirm login eligibility follows the source status.

Do not apply this migration to the separate Supabase production database. Its explicit preflight rejects Supabase.

## Validation and rollback

The migration and verification execute successfully in isolated PostgreSQL regression coverage. The regression confirms backfill, runtime source updates, profile role and agency movement, source deletion, constraints, trigger definitions, and denial of direct runtime membership writes. A live rollback-only validation through `.env.local` stopped at the first owner-only DDL statement because that connection correctly uses `mycaresight_app`; no live change was committed.

If the application build is rolled back, the constraints, triggers, backfill, and reduced runtime grants can remain. They restore the intended source-of-truth behavior and do not depend on the new UI. Removing them would reopen the drift that caused this incident and requires a separately reviewed migration.
