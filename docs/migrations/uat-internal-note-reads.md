# Internal-note read cutover

Prepared 2026-09-22 for local Dev and Azure UAT only. The user applied migration 007 to both branches; read-only verification on 2026-09-22 returned forced RLS, runtime SELECT, no runtime writes, and exactly `internal_notes_scoped_select` on Dev and UAT.

## Live evidence and scope

Supabase read-only access was restored and tested with list_tables and information_schema/catalog queries. The source project is ruidwstxnkgajavxsyft. All 253 inspected source columns across the note/identity/subject tables match Dev (br-bitter-dust-axfgiziy) and UAT (br-empty-mouse-axnk8fbc) in names, types and nullability. Audit-log columns and note constraints/policies were also inspected. This is not a whole-database parity claim.

Before 007, both targets had forced RLS, zero policies, and no table or column privileges on internal_notes. Source policies permit broader agency access through invited/pending memberships; their negative subject-type list also fails to exclude application_playbook_item. This migration deliberately corrects those gaps. Source records were not queried or copied.

## Read rules

| Actor | Permitted note reads |
| --- | --- |
| Active company_owner / care_coordinator with active matching agency membership | Patient, caregiver and visit notes in that agency; associated notes and tag options in the same agency |
| Active admin / expert | Application, application-step, actual uploaded application-document and application-playbook-item notes across agencies, preserving the source platform scope |
| Staff, unknown roles, inactive users, invited/pending/inactive memberships | No note access |

Client role/agency values are never authorization. The repository reloads the active Neon profile, validates the requested membership, and installs transaction-local role/agency context only from that verified scope. Patient RLS still depends on those context values; its broader tightening remains separate work.

The SELECT policy independently checks the current actor, active matching membership, subject-to-agency relationship and same-agency tags. Platform notes must have no patient/caregiver tags. Orphaned subjects, wrong-agency links and malformed historical associations remain invisible; no records are rewritten.

Platform counts are also protected. An agency user cannot infer platform notes from program-item badges. Counters use grouped SQL, explicit zero results for requested absent subjects, and at most 500 input IDs. The legacy program-count wrapper returns an empty map on denial/failure rather than leaking metadata.

## Code changes

- Added src/lib/repositories/internal-note-reads.ts and shared read/search schemas in src/lib/schemas/internal-notes.ts.
- Routed the panel, search audit action, legacy server-only read helpers and program-item counts through the repository.
- Replaced three direct Supabase browser count queries in ApplicationDetailContent and ExpertStepsPanel. ExpertStepsPanel no longer imports a Supabase client.
- Patient/caregiver tag options now load under the panel's verified agency, in the same transaction and with read audits.
- Reads and identifier-only audits commit together. An audit error returns no notes, counts or tag options. Search auditing validates the same subject scope, ignores fewer than three characters, and records SEARCH plus subject identifiers, search length and reported result count, never the term/content.
- The panel retains the existing 600 ms search debounce, clears old data when loading/failing, and ignores responses for a previous subject.
- Each direct/associated note list is bounded at 500; a larger result fails visibly rather than silently truncating. Paging is a later scale requirement.

## Deliberate limits before write cutover

007 grants SELECT only. The separate [008 write cutover](uat-internal-note-writes.md) prepares controlled mutations; 007 itself remains the rollback-safe read boundary.

InternalNotesPanel still has legacy add/edit/delete forms: local state rather than shared RHF/Zod forms, no proper form/noValidate integration, and incomplete field-error/Sonner handling (notably delete failures). The read wiring was changed and this audit is explicit; these forms are not certified migrated. Existing application-status and playbook writers are also not certified atomic and can partially complete unrelated writes when note insertion fails. Keep the main release hold.

ApplicationDetailContent now exposes document notes only when an actual application_documents row exists and passes that application-owned row ID. Empty shared license-requirement slots no longer display a Notes control or enter badge-count requests. Application step notes already use application_steps IDs. The repository and RLS still reject shared template identifiers.

Platform note access retains the source's active admin/expert scope across applications; an assigned-expert-only change would be a separate business rule. Agency-only notes are never caregiver-visible. The four visit/financial staged tables stay closed. Authentication and other workflows still require Supabase.

## Manual Dev-first execution

1. Select Neon project steep-sky-59385366, branch dev (br-bitter-dust-axfgiziy), database neondb, using the independent migration owner. Keep the application's DATABASE_URL on mycaresight_app.
2. Run the complete [007 migration](../../scripts/migrations/007-internal-note-read-access.sql). It is one-time and requires untouched note staging access from 002. If preflight fails, ROLLBACK and inspect; do not grant broad permissions or disable RLS.
3. Run [007 verification](../../scripts/migrations/007-verify-internal-note-read-access.sql). Expect read_access_pass=true, runtime_select=true, runtime_write=false, enabled/forced RLS, and exactly internal_notes_scoped_select for mycaresight_app. Inspect the policy expression.
4. With disposable synthetic/non-PHI fixtures and the matching local code, test permitted agency/platform panels, associated notes, scoped tag lists, counts, search audits, and denial for wrong agency/role, inactive users and invited/pending memberships. Confirm invalid subject/tag links are not displayed. Do not import source records.
5. After Dev verification, apply and verify on uat (br-empty-mouse-axnk8fbc). Live Azure acceptance needs matching code and a verified restricted runtime identity; main deployment remains on hold.
6. Do not run against Production or Supabase. Do not remove Supabase environment variables.

## Rollback

As migration owner, revoke SELECT on public.internal_notes from mycaresight_app and drop only internal_notes_scoped_select in one transaction. Preserve the staged table, records, constraints, indexes and forced RLS. No column-level SELECT grants are introduced by 007; if verification detects unrelated privileges, review them separately. Reads fail closed after rollback.

## Verification

Twenty new disposable PostgreSQL tests execute the actual 002/007 scripts, runtime role and production context helper (only the database transport is substituted). They cover platform/agency separation, membership state, staff denial, linked subjects/tags, scoped counts, generic errors, audit rollback, legacy helper behavior, no-context denial, write denial, and repeat migration rollback.

Three panel tests cover scope arguments, late-response rejection/clearing after access denial, and the 600 ms / three-character search-audit threshold. The existing 117 tests also pass (140 total). TypeScript and focused lint pass; existing hook warnings remain elsewhere in ApplicationDetailContent. Standard npm run lint still fails because ESLint 9 expects a flat configuration.

The final production build passed using synthetic process-level service settings. Existing hook warnings remain; the synthetic artifact must not be deployed. Rebuild with UAT configuration. The panel boundary returns plain arrays without driver metadata. Final whitespace checks passed. Live Dev/UAT application acceptance, provider-independent sessions, complete audit coverage and HIPAA readiness are not established. No remote writes, deployment, push or production access occurred.
