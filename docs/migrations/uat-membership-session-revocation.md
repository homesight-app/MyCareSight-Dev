# UAT Membership Session-Revocation Hardening

Status: prepared; not applied to any database.

## Problem

Migration 019 synchronized `user_agency_roles` after every update to an agency
administrator, care coordinator, or caregiver domain row. A non-authorization
edit, such as saving caregiver skills or an address, therefore performed an
unchanged membership update. Migration 015 correctly treats membership updates
as security-sensitive and revoked the linked Auth.js session. The result was an
unintended logout after a successful domain save.

Separately, unexpected session-datastore failures were silently converted to a
missing session at the shared application boundary. This made an operational
failure difficult to distinguish from an expired or revoked session.

## Prepared change

Managed migration 039:

- limits source synchronization triggers to insert, delete, and updates that
  name `user_id`, `agency_id`, or `status`;
- skips the membership upsert when normalized status is unchanged;
- limits the membership revocation trigger to authorization columns; and
- makes the revocation function ignore updates whose authorization values are
  unchanged.

The application emits only a stable session-datastore failure category. It does
not log an error object, identity, token, route, database URL, or request data.
Unexpected failures remain fail-closed.

## Promotion sequence

1. Confirm migration 038 and the approved legacy baseline exist in the target.
2. Create or verify the target recovery point.
3. Apply migration 039 through the controlled migrator transaction.
4. Run `039-verify-scope-membership-session-revocation.sql`; every value must be
   true.
5. Sign in with synthetic administrator, coordinator, and caregiver accounts.
6. Confirm ordinary personnel/profile edits and caregiver skill saves preserve
   their sessions.
7. Confirm an actual synthetic membership-status change revokes the affected
   session with `membership_changed`.
8. Promote Development before UAT. Do not promote to production-staging or
   production until the prior environment is accepted.

The emergency rollback script is
`scripts/database-rollbacks/039-rollback-scope-membership-session-revocation.sql`.
It restores the earlier broad triggers and therefore reintroduces the defect;
use it only if the scoped triggers cause a confirmed authorization regression.

