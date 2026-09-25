# UAT Supabase removal

Status: local migration work in progress. Database migrations 001-015a have been applied to Dev/UAT as directed and the prepared catalog controls have been verified where recorded below. Remaining browser database calls, Azure runtime/storage acceptance, deployment, and final environment cleanup are pending.
Approved scope recorded: 2026-09-20.
Local branch: codex/uat-supabase-removal. Baseline commit: 0eab0d1.

## Scope and deployment boundaries

- Azure subscription: MyCareSight-Dev-UAT (a268ab63-b7ec-490d-a858-0de0be69ed4f).
- Application: mycaresight-uat on Azure App Service.
- Repository: homesight-app/MyCareSight-Dev. The user confirmed production deploys from a separate repository.
- Target business database: Neon project steep-sky-59385366. Verified branches: local dev (br-bitter-dust-axfgiziy) and UAT uat (br-empty-mouse-axnk8fbc), both neondb. Azure runtime configuration is not yet independently verified.
- Target storage: Azure Blob Storage. The application-owned authorization boundary is prepared locally; the UAT account, private containers, managed identity, malware scanning, and role workflows still require live verification.
- Production stays on Supabase and Vercel. Its migration plan is explicitly deferred.
- Work is prepared through local file changes. No push, deployment, production change, data copy, or credential removal has been performed.
- Use only synthetic/non-PHI data for UAT. Source schema inspection is read-only; no source records are to be copied for this verification.
- Azure's slot named Production is the default slot of the UAT app, not the production platform.

## Evidence and limits

The local Azure CLI account cache matches the approved subscription. Live resource enumeration failed TLS certificate verification, including an escalated retry. This is not verification of live App Service, storage, or database settings.

Read-only Supabase and Neon connections were verified on 2026-09-20. Initial live catalog comparison is complete for the Supabase source and explicit Neon dev/uat branches. At that baseline, both Neon schemas matched in the inspected metadata, but seven application tables, all application functions/triggers, and important integrity constraints were missing. The subsequent 002 migration restored those seven table structures and five timestamp triggers; remaining business functions and integrity repairs are still pending. See [live schema baseline](uat-live-schema-baseline.md) for evidence, limits, and repair priorities. The baseline inspection made no remote changes. The user subsequently applied 001-message-read-state-indexes.sql to dev and uat; read-only verification confirmed all three indexes are valid, ready, and match the expected definitions on both branches.

The user reported successful login and subsequently confirmed the test accounts are verified. Two-account login, refresh, sign-out, reset-email delivery, and database parity have not been independently tested. Earlier logs showed a Mailgun 401 response and unresolved unread-count functions; those findings are still pending verification.

## Approved sequence and acceptance gates

1. Baseline and schema verification: identify the UAT Neon project/branch and storage resources; inspect live source/target metadata, functions, triggers, constraints, and RLS. Verify two synthetic internal accounts and password recovery.
2. Business queries: replace remaining direct Supabase calls with existing or narrowly extended Neon repositories and authorized server actions. Preserve validation, audit events, return contracts, and cache invalidation.
3. Authorization: verify active membership, role, agency, record ownership, transaction-local context, and a non-BYPASSRLS runtime role. Audit all callers before enabling each target RLS policy. Test cross-agency denial.
4. Live updates: replace seven Supabase Realtime consumers with shared authenticated polling, mutation/focus refresh, hidden-tab pause, and bounded request frequency.
5. Storage: verify Azure object coverage, relocate shared helpers, and replace arbitrary-path signing with record-authorized object resolution and bounded expiry. Verify upload/download/delete authorization and auditing.
6. Authentication: keep Auth.js and unify identity/profile reads, provisioning, recovery, and password changes on PostgreSQL. Use Auth.js Credentials with application-owned opaque, revocable sessions; hash reset tokens, rate-limit account/IP attempts, use Argon2id, and revoke on identity or membership changes.
7. Removal and validation: remove unused SDK factories/types/packages, relocate the Neon query layer, isolate historical migration utilities, update documentation/configuration, and validate all role workflows with Supabase variables absent.

GitHub and hosting Supabase settings are removed only from UAT after gate 7. Do not revoke shared credentials or retire production Supabase. Record configuration, versioned changes, and test evidence for the later production plan.

## First local change set

- Removed 40 unused Supabase client constructions and 42 imports in 40 page files.
- Existing query calls and authorization checks are preserved. Pages with active Supabase reads retain the necessary client.
- The UAT workflow now runs only in homesight-app/MyCareSight-Dev.
- A post-login, pre-deployment guard rejects an Azure subscription other than the approved UAT subscription.
- No forms, database queries, policies, storage access rules, or authentication behavior were redesigned in this change set.
- Supabase dependencies and environment variables are still required. This change set is not full migration completion.

## Message read-state change set

Six message RPC dependencies and the invalid boolean read-state update have been replaced locally with an authorized Neon repository. Scalar counts, active membership checks, per-user receipts, and transactional auditing are covered by local synthetic PostgreSQL tests. See [messaging change set](uat-message-read-state.md) for behavior, verification, limits, and the optional index migration. The user applied the optional index migration to dev and uat, and its definitions were independently verified through read-only MCP. Application code remains local; no push or deployment has occurred.

## Missing-table staging change set

Prepared migration 002 for seven empty tables with source-derived constraints/indexes and portable timestamp triggers. Runtime access stays closed while caller/RLS work is completed. Migration 003 optionally seeds four synthetic credential reference rows. All 65 local tests passed when prepared. The user subsequently ran 002 and 003 on Dev and UAT; read-only verification on 2026-09-21 confirmed seven passing staging rows and four exact synthetic fixtures per branch. All seven tables still deny runtime access. See [RLS readiness and cutover order](uat-rls-readiness.md). No remote execution was performed by the agent. See [missing-table run instructions](uat-missing-application-tables.md) for Dev-first execution, verification, deliberate integrity corrections, and remaining workflow dependencies.

## Credential reference access change set

Prepared migration 004 for SELECT-only credential catalog access and a matching self-authenticating Neon repository. Every request checks active Neon identity/membership, including the former cached entry point. The other six staged tables remain closed. Fifteen new database-policy tests pass; the full suite now has 80 passing tests. See [credential cutover](uat-credential-catalog.md) for the one-time Dev/UAT scripts, compatibility behavior, and remaining reference-data reconciliation. Read-only follow-up confirmed 004 is present on both Dev and UAT, with SELECT-only runtime access. Application acceptance remains pending; no remote execution was performed by the agent.

## Pay-rate read change set

Prepared migration 005 and an audited server-only pay-rate repository. Removed three direct Supabase rate reads and routed profile, rate-manager, report, and approval rate reads through current Neon authorization. The shared transaction helper reuses only a matching actor context. All 97 tests, TypeScript, focused lint, and the build with synthetic service settings pass. See [pay-rate read cutover](uat-caregiver-pay-rate-reads.md). Rate editing, forms, and financial write workflows remain pending; 005 grants no writes and has not been applied by the agent.

## Pay-rate write change set

Read-only verification confirmed 005 on Dev/UAT. Prepared 006 for restricted manager inserts/period closing and replaced the missing append RPC with transactional Neon code. Caregiver profile/rate edits and pay batches now use shared validation and atomic audits; same-day corrections retain history without overlapping effective periods. All 117 tests, TypeScript, focused lint, and the final build passed (verification completed 2026-09-22). See [write cutover](uat-caregiver-pay-rate-writes.md). Contract/bill forms, other caregiver writers, and live concurrency acceptance remain pending. The five remaining staged tables are still closed.

## Known database and auth follow-ups

- Live verification confirmed the message functions are absent from both Neon branches. Local code now replaces all six message RPC dependencies and fixes the scalar-count contract; live account acceptance and deployment remain pending.
- Login, session validation, and password reset now have a prepared application-owned PostgreSQL boundary and additive migration 015. Dev/UAT application and synthetic acceptance remain pending.
- Private signed URLs and uploads now enforce record/agency authorization and server-owned object paths. Live Azure configuration, object reconciliation, and malware-scanning acceptance remain required.
- Repository comments and older compliance entries are historical evidence, not proof that all callers have migrated or all RLS policies are applied.

## Verification

- Baseline TypeScript check passed.
- Post-change TypeScript check passed.
- Focused ESLint check of all changed pages passed with ESLINT_USE_FLAT_CONFIG=false.
- Standard npm run lint fails before linting: ESLint 9 expects a flat configuration, but the repository has only .eslintrc.json. This pre-existing configuration issue is recorded separately.
- Workflow YAML parsed successfully. Local shell checks accepted the UAT subscription and rejected a different subscription, an empty result, and an Azure CLI failure.
- Production build passed using the Windows equivalent of the package build command (NODE_OPTIONS=--use-system-ca; npx next build), with synthetic process-level service settings overriding .env.local service credentials. Existing Edge-runtime and React-hook warnings remain. The resulting local build artifact contains synthetic settings and must not be deployed; UAT must be rebuilt with its own configuration.
- Initial live schema comparison completed through read-only MCP. End-to-end and runtime authorization tests remain pending; catalog parity does not establish workflow correctness.
- No test results establish HIPAA readiness or authorization to introduce PHI.

## Rollback

The changes are local and uncommitted. Review the diff against baseline 0eab0d1 and reverse only the reviewed migration changes if needed, preserving unrelated work. The user has applied three additive, non-unique message-query indexes to dev and uat. The user also applied the seven-table staging migration and synthetic credential seed to both branches. Keep those structures access-restricted while preparing workflow cutovers; do not rerun or drop them as a code rollback. Code rollback does not require removing these indexes. No application data, cloud deployment, or production change was made by the agent.

## Changed page files

- src/app/pages/admin/agencies/[id]/page.tsx
- src/app/pages/admin/agencies/page.tsx
- src/app/pages/admin/billing/page.tsx
- src/app/pages/admin/cases/[id]/page.tsx
- src/app/pages/admin/clients/[id]/page.tsx
- src/app/pages/admin/experts/[id]/clients/page.tsx
- src/app/pages/admin/experts/[id]/edit/page.tsx
- src/app/pages/admin/experts/[id]/performance/page.tsx
- src/app/pages/admin/experts/page.tsx
- src/app/pages/admin/leads/page.tsx
- src/app/pages/admin/license-requirements/page.tsx
- src/app/pages/admin/licenses/page.tsx
- src/app/pages/admin/messages/page.tsx
- src/app/pages/admin/page.tsx
- src/app/pages/admin/plans/page.tsx
- src/app/pages/admin/playbooks/[playbookId]/page.tsx
- src/app/pages/admin/playbooks/page.tsx
- src/app/pages/admin/profile/page.tsx
- src/app/pages/admin/programs/page.tsx
- src/app/pages/admin/templates/[id]/page.tsx
- src/app/pages/admin/templates/page.tsx
- src/app/pages/admin/users/page.tsx
- src/app/pages/agency/applications/[id]/page.tsx
- src/app/pages/agency/applications/page.tsx
- src/app/pages/agency/certifications/page.tsx
- src/app/pages/agency/configuration/page.tsx
- src/app/pages/agency/leads/page.tsx
- src/app/pages/agency/profile/page.tsx
- src/app/pages/agency/programs/[applicationId]/page.tsx
- src/app/pages/agency/programs/page.tsx
- src/app/pages/agency/templates/[id]/page.tsx
- src/app/pages/agency/templates/page.tsx
- src/app/pages/caregiver/my-calendar/page.tsx
- src/app/pages/caregiver/my-certifications/[id]/page.tsx
- src/app/pages/caregiver/page.tsx
- src/app/pages/expert/agencies/[id]/page.tsx
- src/app/pages/expert/agencies/page.tsx
- src/app/pages/expert/applications/[id]/page.tsx
- src/app/pages/expert/applications/page.tsx
- src/app/pages/expert/programs/page.tsx

## Direct database-call inventory (completed 2026-09-23)

Source scans now return no direct Supabase client, table, RPC, Storage, or Realtime calls in application code. The provider-neutral PostgreSQL query code still resides partly under the historical `src/lib/supabase/query/` directory; the directory name has no Supabase runtime dependency and can be relocated as a later low-risk cleanup.

## Realtime consumers (completed 2026-09-23)

No Supabase Realtime consumers remain. Authenticated visibility-aware polling uses application-owned server boundaries.

## Latest verification (2026-09-22)

Following user application of 006, read-only checks returned write_access_pass=true on Dev and UAT, with the expected three pay-rate policies, forced RLS, column-limited grants, enabled timeline trigger, and valid/ready active-start index. Historical amount UPDATE remains denied. Five other staged tables remain closed to runtime access. No records were queried, remote changes made, or production branch accessed.

Next: the internal-note caller/policy migration, pending restoration of the unavailable Supabase read-only MCP source connection. AGENTS.md requires live source and target schema inspection before new database-specific SQL. Local code, live synthetic workflow/concurrency acceptance, and deployment gates remain pending; keep the main-push and Supabase-variable-removal holds. This follow-up changes documentation only; tests and build were not rerun.

## Internal-note read change set (2026-09-22)

Supabase read-only access is restored; 253 inspected source note/identity/subject columns match Dev/UAT types and nullability. Prepared migration 007 for SELECT-only internal-note access. Current active profiles/memberships, subject/agency linkage and tag ownership separate agency-only notes from platform application notes. Three browser note-count queries now use audited Neon reads; panels and legacy readers share the repository. Read audits commit before any result is returned.

See [internal-note read cutover](uat-internal-note-reads.md) for Dev-first scripts, validation and limitations. Twenty database tests and three panel tests pass in addition to the existing 117 tests. Final TypeScript, focused lint and the production build pass; standard lint retains its existing configuration failure. The build artifact uses synthetic settings and must not be deployed. Note writes, application/playbook note transactions, mutation-form validation, and shared requirement-template subject reconciliation remain pending. 007 has not been applied by the agent. The main-push/Supabase-variable-removal holds remain.

The user subsequently applied 007 and 008 to Dev and UAT. Read-only catalog verification returned forced RLS, four exact note policies, scoped helper/grants, and denied agency-column UPDATE on both branches. All known note writers use the current-profile, active-membership repository. The panel now uses shared RHF/Zod validation and Sonner; application status changes and playbook migration own their complete mutation/note/audit transactions. Application document note controls now use only application-owned document IDs. Twenty-eight focused note tests, the full 145-test suite, TypeScript, focused lint, whitespace checks, and a clean build pass. UAT remains intentionally unused until the matching code is complete and deployed. Live synthetic acceptance remains.

## Visit and financial discovery (2026-09-22)

Started the next four-table slice and documented the controlled 009–012 sequence in [visit execution and financial cutover](uat-visit-financial-cutover.md). Live source/target inspection and caller mapping found a nonexistent adjustment-history `comment` write, session-derived authorization, a remaining browser Supabase badge query, missing caregiver clock functions, and non-atomic multi-table financial mutations. The confirmed column mismatch is corrected locally; no policies or grants were opened. All four tables remain closed until the matching read repository and 009 tests are ready.

Prepared [009 manager read cutover](uat-manager-visit-financial-reads.md). Time & Billing and its sidebar badge now use a server-only current-profile/active-membership boundary with transactional identifier-only audits; the last browser `visit_financials` query is removed. The four exact SELECT policies validate linked records and grant no writes or caregiver access. Fifteen focused staging/policy tests and the full 147-test suite pass, together with TypeScript, focused lint, whitespace checks, and a production build. The user applied 009 to Dev/UAT, and read-only verification confirmed all four tables pass the expected forced-RLS, SELECT-only checks.

Prepared [010 caregiver visit execution](uat-caregiver-visit-execution.md). Clock-in, clock-out, task completion, notes, list, detail, and past-summary paths now reload the active Neon caregiver and membership inside owned transactions instead of trusting session role/agency fields or missing Supabase RPCs. Time-entry RLS limits rows to the assigned caregiver, grants only execution columns, and a migration-owned trigger derives the pending financial row without caregiver financial-table grants. Identifier-only audits commit with reads and mutations; geolocation values and note content are excluded. The user applied 010 to Dev and UAT, and independent read-only verification returned every control and `access_pass=true` on both branches.

## Manager approval and void change set (2026-09-22)

Prepared migration 011 for agency manager approval and void decisions. The application reloads the current active profile and matching active membership, locks the visit and financial records, validates the request on the server, and commits adjustment history, approval, frozen financial values, time-entry status, and identifier-only audits in one transaction. The old non-atomic helper is retired from all callers. Runtime grants remain column-limited, row ownership fields are immutable, and history has no UPDATE/DELETE access. The user had already applied the initial 011 draft to Dev/UAT; read-only inspection confirmed its seven policies and grants. Follow-up 011a adds linked-record checks to the old-row predicates of the approval and financial UPDATE policies. See [manager visit-financial write cutover](uat-manager-visit-financial-writes.md).

The user applied 011a to Dev/UAT. Read-only verification returned `policy_hardening_pass=true` for approval and financial UPDATE policies on both branches. Prepared the application-only [012 financial maintenance cutover](uat-financial-maintenance.md): bill-rate batches and mileage writes now use current-manager transactions and atomic audits, report/rate reads reload the active membership, and contract rate edits no longer rewrite frozen visit financial history. No 012 database script is required because it opens no new access.

Prepared [013 patient service-contract lifecycle](uat-patient-service-contract-lifecycle.md). Service-contract and weekly-hours reads and writes now use a current-manager Neon repository with agency scoping, row locks, status reconciliation, shared validation, frozen financial snapshots, and atomic identifier-only audits. The four missing Supabase functions are no longer called. Migration 013 replaces broad runtime table privileges with forced RLS, four agency-manager policies, column-limited writes, and a timeline index. Run it on Dev and verify `access_pass=true` before repeating on unused UAT. Production remains out of scope.

The user applied 013 to Dev and UAT. Independent read-only verification returned `access_pass=true` for both branches, including forced RLS, the four exact policies, scoped grants, immutable ownership columns, and the timeline index. Live synthetic workflow acceptance remains pending; production was not queried or changed.

Prepared [014 scheduling lifecycle cutover](uat-scheduling-lifecycle.md). Manager schedule reads and writes now use a current-profile, active-membership Neon repository with linked-record validation, deterministic locks, atomic recurrence changes, and identifier-only audits. Caregiver execution remains behind its assigned-caregiver boundary. Migration 014 forces RLS on visits, tasks, and series; adds manager and caregiver policies; and replaces broad grants with scoped privileges. All 166 tests, TypeScript, focused lint, whitespace checks, and a production build pass. Run 014 and its verification on Dev first, then repeat on unused UAT only after every Dev check passes.

The user applied 014 to Dev and UAT. Independent read-only verification returned `access_pass=true` for all three scheduling tables on both branches, together with `runtime_helper=true` and `helper_not_public=true`. Forced RLS, exact policy counts, indexes, runtime SELECT, immutable agency scope, and scoped writes all match the prepared migration. Live workflow acceptance remains pending.

Converted the duplicated agency caregiver-dashboard totals to an active-manager Neon repository. The old Supabase query referenced nonexistent `caregiver_credentials.days_until_expiry`; live source and Dev/UAT inspection confirmed `expiration_date` is the portable field, and the new aggregate uses it for the 30-day window. Both caregiver dashboard pages have removed their Supabase server clients. All 169 tests, TypeScript, focused lint, whitespace checks, and a production build pass. See [agency caregiver dashboard reads](uat-agency-caregiver-dashboard-reads.md). The next server-read slice is paused because the Supabase read-only MCP connection began failing OAuth refresh after this source validation completed.

## Public and account entrypoints (2026-09-23)

The contact route, onboarding agency lookup, and admin-user agency mapping now use application-owned PostgreSQL boundaries. This removes every non-auth `createAdminClient()` call; only the transitional factory file remains. The contact write uses shared validation, serialized rate-limit enforcement, and an atomic identifier-only audit. See [public entrypoint cutover](uat-public-entrypoints.md). Live synthetic acceptance remains pending.

## Auth.js PostgreSQL session foundation (2026-09-23)

Auth.js remains the framework. The prepared implementation replaces Supabase identity reads and self-contained authorization JWTs with a random opaque cookie whose SHA-256 hash, one-hour expiry, and revocation state live in standard PostgreSQL. Current user and active membership are reloaded from PostgreSQL. New passwords use Argon2id; verified bcrypt passwords upgrade at login. Reset tokens are hashed, one-time, and account/IP rate-limited without revealing whether an account exists.

Migration 015 adds the provider-neutral session, reset-token, and rate-limit tables plus automatic session revocation for profile security and membership changes. The user applied it to Dev and UAT, and independent read-only verification returned `access_pass=true` on both branches for its tables, indexes, runtime grants, public denial, and revocation triggers. See [Auth.js session foundation](uat-auth-session-foundation.md). Local unauthenticated smoke tests return 200 for login, `null` for the session endpoint, and a fail-closed 307 login redirect for a protected admin page. Credentialed Dev login and logout also pass: the protected admin page returns 200, the database records the opaque session and login audit, the test account upgrades from bcrypt to Argon2id, logout revokes the session with reason `sign_out`, and the browser returns to login. Recovery and remaining denial cases are next. Supabase variables and packages remain until Realtime and storage migration gates pass.

## Realtime removal (2026-09-23)

All Supabase Realtime channels have been removed from application source. Notification polling remains at 30 seconds; active message threads and application-progress displays poll their authenticated server actions every 15 seconds, pause while the tab is hidden, refresh on focus/visibility return, and refresh immediately after local sends. The expert message total now uses the authorized PostgreSQL message boundary instead of a direct browser Supabase count. No database migration is required. Storage and remaining direct browser database calls still require the Supabase packages and UAT variables.

## Azure storage authorization boundary (2026-09-23)

Private downloads now resolve exact stored paths to authorized database records before issuing a 10-minute Azure URL. Browser uploads use purpose/resource requests; the server chooses the private container, generates an opaque path, validates size/type, and writes identifier-only audits. A signed short-lived token permits cleanup only of the exact new object after a failed database insert. The stale caregiver license uploader now writes `license_documents` instead of `application_documents`. Shared helpers moved from `lib/supabase/storage` to `lib/storage`; no direct Supabase Storage or provider-named storage helper remains. See [storage authorization boundary](uat-storage-authorization.md). Live Azure and malware-scanning acceptance remain pending.

Migration 015a was also applied to UAT. Independent read-only verification returned zero remaining unambiguous role mismatches, zero orphaned profiles, one reconciliation audit, and `reconciliation_pass=true`.

## Final Supabase runtime removal (2026-09-23)

All direct callers were converted to authenticated server actions and application-owned PostgreSQL or Azure Storage boundaries. The unused Supabase browser/server/admin factories and SDK dependencies were removed. The UAT workflow, Next.js remote-image configuration, Playwright environment example, README, and setup guide no longer require Supabase settings. A regression test rejects Supabase SDK imports, runtime credential names, and Realtime usage in application source or the UAT workflow.

This completes the local code dependency removal and permits deleting the three Supabase settings from the UAT Azure App Service only after the reviewed branch is deployed and the UAT smoke tests pass. Live Azure storage acceptance, cross-agency negative testing, malware scanning/quarantine before PHI, full synthetic workflow regression, and the previously listed Auth.js denial/revocation cases remain deployment gates. Production remains unchanged and out of scope.

## Background jobs (started 2026-09-24)

Live Supabase inventory identified three active schedules that were not replaced by the
web-runtime migration: visit-status synchronization, recurring-visit refill, and
lead-task reminders. Migration 016 prepares the restricted Neon job role, forced-RLS
control tables, idempotent work ledger, transactional outbox, scalable claim indexes,
and visit-status functions. See [UAT background-job migration](uat-background-jobs.md).
Production Supabase schedules remain enabled. Migrations 016, 016b, and 016c are applied
and independently verified on Dev and UAT. Dev synthetic refill acceptance passed with
duplicate delivery suppression and no queue publication or email. The disabled-by-default
Azure worker builds locally, and reviewable Flex Consumption/managed-identity/Key Vault
infrastructure is prepared. Azure what-if, resource deployment, secret references,
reminder delivery, and live UAT acceptance remain pending.

Validation: all 203 tests across 25 suites pass. The final storage/dependency focused run passes 11 tests, TypeScript passes, `git diff --check` passes, the compatible focused ESLint run has zero errors (two existing hook warnings), and the Next.js production build completes. The standard `npm run lint` entry point remains blocked before linting by the repository's pre-existing ESLint 9 flat-config mismatch.
