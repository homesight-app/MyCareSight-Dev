# Dev/UAT RLS readiness after table staging

Verified: 2026-09-21 through read-only Neon MCP, explicitly selecting dev (br-bitter-dust-axfgiziy) and uat (br-empty-mouse-axnk8fbc), database neondb. Production was not queried.

## Live verification

Both branches returned the same results:

- All seven rows from migration 002 verification have stage_pass=true.
- The seven tables contain the expected 100 columns, seven primary keys, five unique constraints, 28 foreign keys, nine check constraints, five triggers, and 24 total indexes (including constraint indexes).
- All seven tables enable and force RLS, have zero policies, and grant no table privileges to mycaresight_app.
- All four reserved synthetic credential fixtures from 003 match their expected IDs, codes, labels, types, display orders, active flags, and null service types.
- mycaresight_app is LOGIN, NOSUPERUSER, NOBYPASSRLS.
- There are 74 public tables. Eight have RLS enabled/forced: patients plus the seven staged tables. The only public policy is patients_agency_rls.

These checks validate staging metadata/counts and the four synthetic fixtures. They are not a complete definition-by-definition schema diff or a live application authorization test. No other application records were retrieved. Azure's actual runtime connection identity remains unverified.

## Access migrations still required

RLS is already switched on for the new tables. The remaining work is reviewed command-specific policies plus least-privilege table grants, paired with server code changes. Do not rerun 002, disable RLS, or grant broad access to resolve current workflow errors.

| Order | Tables | Intended policy scope to validate | Blocking code work |
| --- | --- | --- | --- |
| 1 | credential_catalog | Reference SELECT for authenticated active users; no runtime writes in this slice. | Move access behind a server-only repository; authenticate every entry point, including cache hits; set transaction-local context on database reads. Reconcile task-required credential references separately: four seed rows do not populate the full skill catalog. |
| 2 | caregiver_pay_rates | Authorized agency-management rate writes and scoped reads, with explicitly reviewed caregiver-self/platform read rules. | Replace append_caregiver_pay_rate; verify active membership and caregiver agency; commit rate history and audit together. Review profile and payroll/report callers. |
| 3 | internal_notes | Separate application/platform notes from agency-only notes; validate subject/tag agency ownership and authorship on permitted mutations. | Cover note actions plus application/playbook insertion and count paths; enforce active membership, transaction context, and reliable audit writes. |
| 4 | visit_time_entries | Assigned active caregiver operations and authorized agency-management operations; scoped read access. | Replace clock-in/out function dependencies; cover visit detail/history and billing-created entries; enforce visit/agency/assignment relationships, context, and audits. |
| 5 | visit_approvals, visit_financials, visit_adjustment_history | Authorized agency decisions and scoped report reads; adjustment history append-only for runtime. | Make approval/void/calculation/history/audit updates transactional; validate every linked visit, patient, caregiver, and contract; audit reporting callers before granting access. |

These scopes are migration requirements, not approved blanket role grants or executable SQL. Every applicable caller and live source policy must be reviewed before each concrete access migration is issued. Shared helper/policy queries must also be checked for role grants, RLS recursion, and transaction/pool behavior.

## Concrete caller findings

- Credential reads go through lib/supabase/query/task-required-credentials.ts, query-bridge.ts, and server-cache/reference-lists.ts. The cached public wrapper currently delegates directly to unstable_cache without its own authentication check. Adding a session-dependent policy requires deliberate handling of both cache misses and hits.
- caregiver-pay-rates.ts calls append_caregiver_pay_rate and checks agency equality, but lacks a current active-management membership check and a single rate/audit transaction. caregiver-profile.ts establishes context but its shared authorization helper relies on platform role, self, or profile agency equality.
- internal-notes.ts establishes context for its actions, while applications.ts and playbooks.ts also access internal_notes outside that boundary. Enabling only the panel's path is insufficient.
- caregiver-visit-execution.ts still calls caregiver_clock_in_visit and caregiver_clock_out_visit. Context coverage is partial. time-billing.ts and visit-approval-financials.ts need a shared authorized transaction boundary before financial-table grants.
- Existing patients_agency_rls applies FOR ALL using role/agency context. The policy itself does not check current active user/membership or caregiver assignment, and does not distinguish read from write permissions. Keep the current protection while auditing callers; prepare a separate tightening migration with negative-access tests. Do not reapply the old script as a fix for the new tables.

Paths above are under src/. This is a readiness review, not certification of all authorization paths. The other 66 public tables also remain outside database RLS coverage; classify and audit them by workflow rather than enabling every table at once.

## Verification gate for each access migration

Use disposable synthetic fixtures first, then Dev before UAT. Test unauthenticated/no-context denial, inactive/invited/pending membership denial, wrong-role and cross-agency denial, permitted same-agency access, and caregiver assignment/self scope where applicable. Validate linked-record consistency, rollback on audit failure, and context isolation across pooled requests. Preserve immutable adjustment history.

Apply the matching code and access migration as a coordinated change. Keep Supabase settings and hold the main deployment until the release gates in the main migration document are met. Follow-up: credential read-access migration 004 and its matching repository are now prepared locally; see [credential cutover](uat-credential-catalog.md) for verification and execution gates. Other workflow policies remain pending.

## Subsequent progress

Read-only verification confirmed migration 004 in both Dev and UAT with SELECT-only credential access. Pay-rate read migration 005 and all known pay-rate reader replacements are now prepared locally; see [pay-rate read cutover](uat-caregiver-pay-rate-reads.md). This intentionally separates read access from pending rate-edit/form/history work. Notes and visit/financial policies remain pending.

## Current access state (2026-09-22)

The earlier staging findings above are historical. User-applied 004 and 005 were previously verified; 006 now passes read-only verification on both Dev and UAT. Credential reference reads and scoped pay-rate reads/writes have their reviewed boundaries. Internal notes and the four visit/financial tables remain closed: forced RLS, zero policies, and no runtime table or column grants.

Internal notes is the next planned policy/caller slice. The Supabase source MCP tools are unavailable in the current session, so no new source-specific SQL or policy migration was prepared. Restore the existing read-only source connection before continuing live source/target validation required by AGENTS.md. Neon verification remains available. Live role/concurrency acceptance and Azure runtime identity are still outstanding.

## Internal-note SELECT preparation (2026-09-22)

The source MCP connection is restored. Live source/Dev/UAT column and policy inspection is complete for the note-read slice. Migration 007 and the matching server-only read repository are prepared; see [internal-note reads](uat-internal-note-reads.md). Only SELECT is opened, with current active identity/membership, actual subject lineage and valid same-agency tags. Agency roles cannot read platform playbook-item notes or their counts. Note writes and four visit/financial policies remain pending; 007 awaits manual execution.
