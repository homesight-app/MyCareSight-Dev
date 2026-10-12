# UAT agency-membership drift repair

Status: migration 021 and the matching account-status changes are prepared locally. They have not been applied or deployed.

## Why this is required

Development diagnosis found an active `user_profiles` row whose current `company_owner` membership was `pending`, together with an obsolete active `staff_member` membership from an earlier role. Authentication and password setup correctly require an active membership matching the profile's current role and agency. The administrator list previously displayed only `user_profiles.is_active`, so the account appeared active even though it could not log in.

Migration 021 removes historical memberships that do not match the current profile and domain role row. It does not convert pending or invited memberships to active. Activation remains an explicit administrator decision.

## Run order

Use a direct Neon owner connection, not the pooled `mycaresight_app` runtime connection.

1. Apply to Development:

   ```powershell
   psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/021-reconcile-user-agency-role-drift.sql
   ```

2. Verify Development:

   ```powershell
   psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/021-verify-user-agency-role-drift.sql
   ```

   Expected results:

   - `missing_or_stale_count = 0`
   - `unexpected_membership_count = 0`
   - `profile_cleanup_trigger_ok = t`
   - `public_execute_blocked = t`

3. Repeat the unchanged migration and verification on UAT.
4. Deploy the matching application code.
5. In platform **User Management**, open the **Inactive** tab. The affected pending account should now appear there.
6. Choose **Enable Account**. This changes the matching domain role and profile to active in one transaction and records an audit event.
7. Choose **Set Password**, save the new password, then verify login.

Do not update `user_agency_roles` directly. Migration 019 intentionally blocks runtime writes because the domain role tables and their triggers own membership state.

## Acceptance

Using synthetic accounts only:

1. Confirm a pending agency user appears inactive and cannot receive a password or log in.
2. Enable the account and confirm its profile, domain role, and matching membership are active.
3. Set the password and confirm login succeeds.
4. Disable the account and confirm current sessions are revoked and login fails.
5. Change a user from caregiver to agency administrator and confirm the old caregiver record is inactive and no stale staff membership remains.
6. Confirm an unauthenticated caller cannot create a privileged account.

Production remains outside this UAT migration slice.
