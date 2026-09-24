# Internal-note write cutover

Prepared 2026-09-22 for local Dev and Azure UAT only. The user applied migration 008 to both branches. Read-only catalog verification confirmed forced RLS, all four exact note policies, the scoped helper, content INSERT/UPDATE and row DELETE, with agency UPDATE denied on Dev and UAT. UAT remains intentionally unused until the matching code is complete.

## Change

All known note writers now use `src/lib/repositories/internal-note-writes.ts`: panel add/edit/delete, application status notes, and legacy step-to-program note copying. The repository reloads the current active Neon profile, requires an active matching agency membership for agency notes, resolves the real subject and agency, validates tag ownership, and prevents patient/caregiver tags on platform notes. Caller-provided session roles and agency identifiers do not establish access.

Create, update, delete and their identifier-only audit records share an owned database transaction. Audit failure rolls back the note mutation. Content is trimmed, must contain 1–10,000 characters, and is never copied into audit details. Scope and original authorship columns are immutable to the runtime role; only content, updater metadata, and tags receive UPDATE grants.

Migration 008 adds separate INSERT, UPDATE and DELETE policies over the existing 007 SELECT policy. A security-invoker predicate checks the current database actor, membership state, subject relationship and tags. It grants only the required insert/update columns plus row DELETE. Forced RLS remains enabled. Shared requirement-template identifiers remain rejected because they are not application-owned subjects.

## Apply and verify

1. Use the independent migration owner on Neon Dev `br-bitter-dust-axfgiziy`, database `neondb`. Keep application connections on `mycaresight_app`.
2. Run [008-internal-note-write-access.sql](../../scripts/migrations/008-internal-note-write-access.sql) once.
3. Run [008-verify-internal-note-write-access.sql](../../scripts/migrations/008-verify-internal-note-write-access.sql). Expect `write_access_pass=true`, four exact note policies, forced RLS, content UPDATE allowed, agency UPDATE denied, and no truncate/reference/trigger grants.
4. Test with synthetic records: agency create/edit/delete, platform application notes, wrong-agency denial, inactive and invited/pending denial, foreign-tag denial, and audit failure rollback.
5. Dev and UAT were both applied and catalog-verified on 2026-09-22. Keep UAT unused until this matching code is deployed and acceptance-tested.
6. Do not run on Production or Supabase.

## Rollback

As migration owner, revoke DELETE and the listed column INSERT/UPDATE privileges from `mycaresight_app`; drop `internal_notes_scoped_insert`, `internal_notes_scoped_update`, and `internal_notes_scoped_delete`; revoke/drop `internal_note_write_allowed(uuid,text,uuid,uuid,uuid)`. Preserve 007 SELECT and forced RLS.

## Validation and remaining gates

Twenty-eight focused note tests pass, including execution of the actual 008 SQL, scoped create/update/delete, immutable-column denial, validation, application-status atomicity, and audit rollback. The full suite passes with 145 tests across 11 suites. TypeScript, focused legacy ESLint, whitespace checks, and a clean production build pass. Standard ESLint 9 invocation retains the repository's existing missing flat-config failure. The build still reports the existing Edge-runtime/Supabase/bcrypt and React-hook warnings.

The panel now uses the shared Zod editor schema through React Hook Form with `noValidate`, inline/server errors, and Sonner feedback. Manual application status changes, their audit, status note and note audit are one transaction. Playbook migration reloads the active platform actor and wraps item creation, copied notes and its audit in one transaction.

Application document note entry points now use only actual application_documents IDs; empty shared requirement slots expose no Notes control. Live synthetic account acceptance remains pending. Four visit/financial tables, Realtime, Azure storage, Auth.js/session migration, and final Supabase environment-variable removal remain pending.
