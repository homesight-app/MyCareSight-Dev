# UAT background-job migration

## Scope

This controlled UAT slice replaces three active Supabase schedules for the Neon-backed
Azure environment. Production remains on Supabase and its schedules must remain enabled.

Live read-only inventory on 2026-09-24 confirmed:

| Workload | Live UTC schedule | UAT target |
|---|---|---|
| sync scheduled visit statuses | every five minutes | Azure timer calling the Neon function |
| refill visit series | daily at 14:00 | Azure discovery timer, outbox, and queue worker |
| lead task due reminder | daily at 08:00 | Azure discovery timer, outbox, and queue worker |

The active make-server-3706f9c5 Supabase Edge Function is an unreferenced prototype
backed by the excluded kv_store_3706f9c5 table. It is not part of UAT and must not be
disabled while production ownership is unresolved.

## Architecture and safeguards

Migration 016 adds a content-free job ledger and transactional outbox. Azure queue
messages contain only an opaque outbox ID. Workers reload the referenced row using the
dedicated mycaresight_jobs Neon login. That role is non-superuser, cannot bypass RLS,
and receives only the columns and operations required by the three jobs.

The database enforces stable idempotency keys, bounded claim indexes, retry/dead-letter
states, forced RLS on job-control tables, and terminal visit-status preservation. Job
tracking must never contain names, email addresses, task text, notes, visit descriptions,
document paths, or email bodies.

This design supports 45 CFR 164.312 access control, audit control, integrity, entity
authentication, and transmission-security safeguards. It does not establish HIPAA
readiness. Azure, Neon, and any email-provider BAA and configuration gates remain
mandatory before PHI is introduced.

## Controlled execution order

1. Run scripts/neon-runtime-role-rotate.sql to rotate the exposed mycaresight_app
   password in Neon Dev and update local DATABASE_URL.
   Rotate UAT during a coordinated App Service configuration update. The Neon production
   branch does not currently contain this role and remains untouched. Completed for Dev
   and UAT on 2026-09-25; the user confirmed both connection settings were updated.
2. Copy scripts/neon-job-role-setup.sql into the Neon Dev SQL editor, replace the
   placeholder in the editor with a unique generated password, and run it without saving
   the secret to the repository.
3. Run scripts/migrations/016-background-job-foundation.sql on Dev.
4. Run scripts/migrations/016-verify-background-job-foundation.sql and require
   access_pass=true.
5. If the job role is reset or recreated after migration 016, run
   scripts/migrations/016a-restore-background-job-role-access.sql and repeat the 016
   verification. Role replacement removes grants and role-bound RLS policies.
6. Run scripts/migrations/016b-scheduled-visit-series-idempotency.sql and its verification.
   This partial unique index protects recurring refills without restricting standalone visits.
7. Run scripts/migrations/016c-background-job-notification-returning.sql and its verification.
   It permits reading only the generated notification ID, not notification content.
8. Complete local worker tests against synthetic Dev data.
9. Repeat the job-role setup, migrations 016, 016b, and 016c, and their verifications on UAT
   using a different
   password.
10. Store only the UAT job-role connection string in Azure Key Vault and expose it to the
   Function App through a Key Vault reference.
11. Deploy every function disabled, validate connectivity and sanitized telemetry, and then enable
   status sync, visit refill, and reminders in that order.

The GitHub workflow validates on pull requests and pushes but deploys only from a manual
workflow dispatch on main. The Function App also requires JOBS_ENABLED=true before any
timer or queue worker performs work; the initial Azure setting must be false. Initial
deployment must also set each `AzureWebJobs.<functionName>.Disabled` setting to `true`,
including `processBackgroundJob`, so a paused queue message is not consumed. Enable
individual functions only during their acceptance gate.

## UAT queue-trigger acceptance follow-up (2026-09-29)

Read-only UAT ledger checks confirmed successful refill discovery for three series
and publication of all three outbox messages. The latest processing check showed
three queued items with zero attempts and no result records. User-provided host
telemetry then reported that `queueTrigger` was not registered.

Prepared a local `azure-functions/host.json` correction: load extension bundle 4.x,
set queue `messageEncoding` to `none` to match the dispatcher's plain JSON payloads,
and retain successful invocation telemetry with `Host.Results=Information`.
The deployed host must load the bundle before queue-worker acceptance can continue.
Deploy the corrected jobs package with the queue worker disabled, then enable only
that worker for the existing three messages. Keep discovery and dispatcher timers
disabled during this check. Do not republish or delete the existing messages.
If messages have moved to the poison queue, inspect metadata before controlled replay.
Live queue-trigger loading, visit creation, and reminder delivery remain unverified.

Subsequent verification after the user deployed the fix and enabled the worker:
all three refill items reached a terminal state on their first processing attempt.
Two succeeded with result visits matching their work-item agency, series, and
run date plus 21 days. One was skipped; aggregate inspection confirms its active
series has no existing visit to use as a template. No item recorded an error.
This establishes live queue-worker execution and two refill creations, not full
refill acceptance: task-copy parity, replay, and reminder delivery remain pending.

## UAT end-to-end acceptance (2026-09-30)

User-executed UAT checks closed the remaining functional job gates using synthetic
records and content-free operational queries:

- Lead-reminder discovery examined one due task and queued one item. The outbox
  published it, the queue worker completed successfully, and Mailgun delivered the
  generic reminder to an authorized test recipient. Repeating discovery for the same
  UTC day returned the existing daily run and did not send another message.
- The two previously successful refill results contained exactly the same task counts
  as their template visits (two-to-two and one-to-one). Replaying a completed refill
  outbox identifier left the item succeeded, its attempt count unchanged, and exactly
  one visit for the series/date.
- The 2026-09-30 refill discovery examined and queued three eligible series. All three
  items succeeded on their first attempt, produced result visits, and had published
  outbox rows with no errors, retries, or dead letters.
- The jobs-specific Application Insights resource contained the successful refill
  discovery, three successful queue-worker events, and normal once-per-minute idle
  outbox polling. The inspected two-hour slice contained only Information-level rows
  and no warnings or errors.

`JOBS_ENABLED` and all five function registrations are enabled. Functional UAT
acceptance is complete for status synchronization, both discovery jobs, outbox
dispatch, queue processing, refill creation/task copying/replay safety, and reminder
delivery/replay safety. Continue routine monitoring of the next natural 08:00 UTC and
14:00 UTC daily timer executions; manual invocation was used for the daily acceptance
checks. Production schedules and data were not changed.

## Rollback

Disable the Azure Function App timers and queue workers. Do not switch the UAT web app to
an owner credential and do not disable production Supabase schedules. Migration 016 is
additive; retain its audit tables during investigation rather than dropping evidence.
