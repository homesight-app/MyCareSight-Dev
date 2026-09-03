# Step 1: Migration Control and Dependency Inventory

**Status:** application controls complete; provider configuration verification pending

**Decision date:** 2026-09-02

## Purpose

This document establishes the first controlled step in moving MyCareSight from
Supabase and Vercel to DigitalOcean, Neon, Azure Blob Storage, and GitHub-managed
delivery. It makes no runtime, authentication, database, or hosting change.

The current application is internal-only: platform administrators manage leads,
playbooks, programs, and agency information. The migration environment must
continue to use synthetic data and must not store, transmit, or log PHI/ePHI
until every relevant vendor agreement and control is in place.

## Freeze Controls

### Effective now: controlled change freeze

Do not add any new dependency on Supabase Auth, Supabase Storage, Supabase Edge
Functions, PostgREST/RPC, or Vercel-specific behavior. New work in an existing
area must be recorded here or in its pull request with its intended provider
boundary.

Do not introduce a new public sign-up, invitation, password-reset, magic-link,
or MFA flow while the authentication design is being replaced. Self-service
registration has been disabled: `/pages/auth/signup` is inaccessible, its shared
Supabase sign-up helper has been deleted, and unauthenticated legacy `/signup`
requests redirect to login. All remaining magic-link sends set
`shouldCreateUser: false`. User provisioning remains restricted to existing
authorized administrative flows until invite-only provisioning is implemented.

Continue normal internal administration with synthetic, non-PHI data. Any
exception to this controlled freeze must state its affected tables, storage
buckets, authentication impact, rollback, and future migration owner.

### Later freeze points

1. **Hard database schema freeze:** immediately before the first production
   data-domain extraction (Step 3). From that point, no untracked Supabase schema
   or RLS change may be applied.
2. **Authentication/code feature freeze:** at the start of the Auth.js migration
   (Step 6) through authentication cutover. Security fixes remain allowed.
3. **Short write freeze:** only during the final data/auth cutover. Prepare it
   after the new stack has been validated, not now.

## Source-Backed Inventory

### Authentication and authorization

| Area | Current dependency | Migration implication |
| --- | --- | --- |
| Request gate | `middleware.ts` delegates to `src/lib/supabase/middleware.ts` | Replace with an Auth.js-compatible, fail-closed middleware and server-session check. |
| Session/profile helpers | `src/lib/auth.ts` and Supabase server/browser clients | Separate identity, active session, platform role, and agency membership behind app-owned interfaces. |
| Login and recovery | `src/app/pages/auth/login`, `reset-password`, `change-password`, and `auth/callback` | Rebuild on the selected Auth.js credentials/OTP flow; do not carry Supabase session assumptions forward. |
| Public registration | The `/pages/auth/signup` route is inaccessible, its shared `signUp` helper was removed, and all remaining magic-link sends set `shouldCreateUser: false`. | In Supabase Dashboard, disable **Allow new users to sign up** and **Allow anonymous sign-ins**. Maintain invite-only provisioning; self-selected roles are not an acceptable authorization boundary. |
| Admin provisioning | `src/app/actions/users.ts` uses `auth.admin` and `signInWithOtp` for magic links | Replace with an app-owned provisioning service and one-time invitation/verification tokens. |
| Authorization data | `user_profiles`, `user_agency_roles`, role/status checks, and RLS functions using `auth.uid()` | Move authorization decisions server-side and make the database enforce tenant ownership independently of session claims. |

### Database and RLS

- The codebase currently has 149 source files containing direct `.from(...)` or
  `.rpc(...)` access. These calls are distributed across actions, pages,
  components, and shared helpers, so database replacement cannot be treated as a
  single client swap.
- The migration history is substantive and includes role, agency, patient,
  caregiver, scheduling, billing, notifications, lead, playbook, and audit
  changes. Many policies and helper functions reference Supabase Auth constructs
  such as `auth.uid()`.
- `supabase/migrations/phase_two/160_agency_people_company_owner_rls.sql`,
  `162_user_agency_roles_phase_a.sql`, `163_rls_functions_phase_b.sql`, and the
  later migrations are part of the authorization baseline, not merely schema
  history.

### Object storage

| Current item | Evidence | Migration implication |
| --- | --- | --- |
| Bucket model | `src/lib/supabase/storage.ts` defines application, patient, staff-member, lead, agency, and agency-public buckets | Create an app-owned object-storage interface before Azure Blob Storage migration; retain private-by-default policy. |
| Generic helpers | `src/lib/storage/client.ts` and `src/lib/supabase/storage.ts` issue Supabase signed URLs | Replace with an authorization-checked server endpoint that issues short-lived Azure Blob Storage SAS URLs only after tenant/resource verification. |
| Direct calls | 20 source matches for `supabase.storage` or `.storage.from(...)` | Inventory each call before moving a document-bearing feature; do not rely solely on the two helper files. |
| Bucket policies | `104_private_storage_buckets.sql`, `145_agency_documents.sql`, and `148_storage_agency_lead_bucket_policies.sql` | Translate object ownership and agency access rules to database checks plus private-container and blob-name conventions. |

### Background work and email

| Job | Current host and secret boundary | Target direction |
| --- | --- | --- |
| `refill-visit-series` | Supabase Edge Function using service role and `CRON_SECRET`; documented daily schedule at 23:00 UTC | Move to a DigitalOcean worker/cron or another approved scheduler with a dedicated service identity, idempotency, and run audit. |
| `lead-task-due-reminder` | Supabase Edge Function using service role, `CRON_SECRET`, and Resend | Move with the same service-identity pattern; keep email content non-sensitive until the HIPAA gate is passed. |
| Scheduling configuration | `supabase/config.toml` and `supabase/sql/refill_visit_series_cron_net_http_post_example.sql` | Inventory the live schedules and disable duplicate execution only at the cutover runbook stage. |

### Deployment and delivery

- GitHub Actions already runs Node 20, `npm ci`, type checking, and Jest for
  `main` and pull requests in `.github/workflows/ci.yml`.
- No project-local Vercel configuration was found. Dashboard configuration,
  environment variables, domains, previews, redirects, cron settings, and
  observability must be captured manually before deployment migration.
- `next-sitemap.config.js` contains the hard-coded Vercel URL
  `https://home-care-licensing.vercel.app/`; make this environment-driven during
  the deployment work.

## First Vertical Slice

Begin with **platform reference configuration and playbooks**. This slice is
lower risk than agency, person, lead, document, scheduling, billing, or care
delivery records, and it lets us prove the Neon data-access boundary with no
external accounts and no PHI.

Candidate scope:

- Program, license, category, task-catalog, feature-plan, and generic
  configuration reference data.
- Playbook templates, playbook categories, validation definitions, and
  playbook lifecycle metadata.
- Server-side read/write actions, validation, and tests for only these records.

Explicitly exclude from the first slice:

- `auth.users`, profiles, roles, memberships, invitation flows, and middleware.
- Agencies, agency people, leads, applications, internal notes, documents, and
  all object storage.
- Patients, caregivers, visits, schedules, service contracts, billing,
  notifications, and the two scheduled jobs.

## Required Inputs Outside the App

Before Step 2, the project owner should:

1. List every active internal administrator, their intended platform role, and
   the email address used for access. Do not export passwords or session tokens.
2. Confirm that all current and future development/test records are synthetic
   and contain no PHI/ePHI.
3. Stop approving new Supabase schema, RLS, bucket-policy, Edge Function, or
   Vercel-dashboard changes unless they are documented exceptions to this file.
4. In Supabase Dashboard, go to **Authentication > Configuration > General
   configuration** and disable **Allow new users to sign up** and **Allow
   anonymous sign-ins**. Confirm existing administrator login and admin-created
   magic links still work after the change.
5. Create a non-production DigitalOcean, Neon, Azure Blob Storage, GitHub, and email
   environment with separate credentials from production. Do not migrate live
   data or enable external accounts yet.
6. Preserve the current Supabase migration history and capture the live project
   configuration, secrets inventory by name only, active cron schedules, storage
   buckets, and Vercel dashboard settings. No secret values belong in Git.

## Step 1 Exit Criteria

- This inventory is the working migration-control record.
- The controlled change freeze is active.
- Supabase **Allow new users to sign up** and **Allow anonymous sign-ins** are
  disabled and existing administrator sign-in has been verified.
- The first data slice and its exclusions are agreed.
- The external environment and administrator inventory are ready for Step 2.

## Next Step

Step 2 is infrastructure preparation only: establish isolated non-production
accounts and least-privilege credentials for DigitalOcean, Neon, Azure Blob Storage,
GitHub Actions, and email. No user-account creation, authentication cutover, or
production data transfer occurs in that step.
