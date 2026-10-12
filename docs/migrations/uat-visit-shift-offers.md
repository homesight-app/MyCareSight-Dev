# UAT open-shift advertising

Status: migration 020 and the matching application workflow are prepared locally. Codex has not applied the migration to a Neon branch or deployed the application.

## Scope

The existing caregiver Scheduling page passively lists agency open visits. Migration 020 adds durable manager-initiated outreach without exposing patient identity or care details in notification content. Agency owners and care coordinators can notify selected eligible caregivers or all eligible caregivers. Recipients can express interest through the existing assignment-request workflow or mark the invitation not interested.

An eligible recipient must have an active caregiver record, active `staff_member` profile, active exact agency membership, availability covering the shift, no overlapping active visit, and all configured patient skill requirements. The server recalculates eligibility during publication and does not trust browser-supplied caregiver or agency identifiers.

## Migration behavior

`020-visit-shift-offers.sql`:

- creates agency-scoped `visit_shift_offers` and `visit_shift_offer_recipients` tables;
- permits only one open campaign per visit and one recipient per caregiver/campaign;
- links assignment requests back to their outreach recipient;
- installs manager and caregiver RLS policies and least-privilege runtime grants;
- closes a campaign and expires invitations when a visit is assigned, cancelled, held, completed, missed, materially rescheduled, or otherwise closed;
- resolves pending requests consistently when the shift is filled or closed;
- returns an interested recipient to notified if that linked request is withdrawn; and
- blocks public and jobs-role table access.

The application uses fixed invitation content containing only date, time, and broad service class. It does not include patient name, address, notes, care tasks, diagnoses, or manager-entered free text. Campaign and response audits contain identifiers, state, and counts without note content.

## Run order

Use a direct Neon owner connection. Do not use the pooled `mycaresight_app` runtime connection for DDL.

1. Apply to Development:

   ```powershell
   psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/020-visit-shift-offers.sql
   ```

2. Verify Development:

   ```powershell
   psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/020-verify-visit-shift-offers.sql
   ```

   Every boolean must be `t`. `duplicate_open_offer_count` and `cross_agency_recipient_count` must both be `0`.

3. Repeat the unchanged migration and verification against the UAT owner connection.
4. Deploy the matching application build only after both branches pass verification.
5. Complete synthetic browser acceptance in Development, then UAT.

Do not apply this migration to the separate Supabase production database. Its preflight rejects Supabase.

## Synthetic acceptance

Use only synthetic caregivers, clients, and visits:

1. Create an unassigned future visit with start/end time and required skills.
2. Confirm inactive caregivers, inactive profiles/memberships, unavailable caregivers, overlapping caregivers, and caregivers missing required skills do not appear as eligible.
3. Advertise to one selected caregiver and confirm only that caregiver receives the in-app notification.
4. Open the notification and confirm the invitation contains no client name, exact location, notes, or care tasks.
5. Respond interested and confirm a single pending assignment request appears for the coordinator.
6. Withdraw the request and confirm the invitation can be reconsidered.
7. Respond not interested and confirm the coordinator count changes without creating a request.
8. Advertise to all eligible caregivers and confirm previously notified recipients are not duplicated.
9. Fill the shift and confirm the campaign closes, remaining invitations expire, and pending requests resolve consistently.
10. Change an advertised shift's date or time and confirm the old campaign closes and a fresh advertisement is required.
11. Attempt a cross-agency publication and response and confirm both fail closed.

## Rollback

Application rollback can leave migration 020 in place because existing visit and request workflows do not depend on outreach rows. Do not drop the new tables after they contain audit-relevant campaign history. A schema rollback would require a separately reviewed migration that first reconciles linked assignment requests and retention requirements.
