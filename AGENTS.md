# AGENTS.md

This file provides project guidance for Codex and other coding agents working in this repository.

## Current Migration Context

The application is currently a Next.js 15 App Router application backed by Supabase Auth, Postgres, Storage, and RLS. The approved target stack is DigitalOcean for application hosting, Neon Postgres, Azure Blob Storage, and GitHub.

The current application has internal platform administrators only. Do not add real agency, caregiver, patient, visit, document, or other PHI data to new non-HIPAA environments. The pre-HIPAA migration environment must contain only synthetic or otherwise non-PHI data.

The migration order is deliberate:

1. Decouple business-data access from Supabase while temporarily retaining internal Supabase authentication.
2. Move Storage behind application-owned server interfaces and migrate it to Azure Blob Storage.
3. Make the Next.js application deployable on DigitalOcean.
4. Replace Supabase Auth with Auth.js and Neon-backed sessions.
5. Complete BAA, infrastructure, operational, and security gates before external users or PHI are introduced.

Do not introduce new direct Supabase browser queries, direct Supabase Storage calls, or Vercel-only behavior. Route new infrastructure through application-owned interfaces so the provider can be exchanged safely.

## Design Review

When the user is exploring a non-trivial design, proposing a feature, or asking how to approach a change, provide a short design review before implementation. Do not begin implementation until the user confirms the direction when they explicitly request planning or design review.

Use this format:

> **Technical Architect:** 3-5 bullets on architectural fit, data model, performance, security and RLS/HIPAA impact, migration safety, and blast radius.
>
> **Business Analyst:** 3-5 bullets on workflow value, edge cases, business rules, MVP scope, scale, and operational implications.
>
> **Recommendation:** 1-2 sentences with the preferred approach and any decision that needs user input.

### Technical Architect Lens

- Fit with the active stack and migration stage.
- Reuse of existing components and utilities instead of parallel implementations.
- Database normalization, indexes, transaction boundaries, N+1 risks, and long-term migration cost.
- Authorization, tenant isolation, RLS, storage, API, and HIPAA surface.
- Whether the change is additive or breaking, its rollback path, and its blast radius.

### Business Analyst Lens

- The users, workflow, immediate pain, and success criteria.
- The smallest useful version versus the longer-term vision.
- Business-rule edge cases and interaction with adjacent workflows.
- Behavior at 10x agencies and 10x data volume.
- Regulatory, licensing, compliance, and operational implications.

## Reuse Before Building

Search the codebase before building a modal, multi-step flow, button, or UI pattern. Reuse or extend an existing equivalent rather than making a second implementation.

Important reusable flows:

- Apply for / Request a Program: `ApplyForNewLicenseButton` in `src/components/ApplyForNewLicenseButton.tsx`. It accepts `programsOnly` and `agencyId` props and orchestrates `NewLicenseApplicationModal`, `SelectLicenseTypeModal`, and `ReviewPlaybookRequestModal`.
- Create License Modal: `src/components/CreateLicenseModal.tsx`.

Do not duplicate a flow for a different entry point. Extend the shared component with a prop when needed.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Before completing a code change, run the focused checks first, then run `npm run lint`, `npm run typecheck`, and `npm run build` when they are proportionate to the change. Report any checks not run.

## Database Source of Truth

While Supabase remains the production source of truth, the live Supabase database is authoritative. Migration files may be stale, partially applied, or missing dashboard changes.

Before writing or reviewing Supabase SQL column references, use the Supabase MCP project `ruidwstxnkgajavxsyft` to inspect the live schema. Use `list_tables` and `execute_sql` against `information_schema.columns` to validate table names, columns, types, nullability, and constraints.

If the MCP connection is unavailable, stop before writing or reviewing database-specific Supabase SQL and tell the user. Do not silently rely on migration files. During the Neon migration, validate both the live Supabase source schema and the live Neon target schema; do not infer either from stale files.

## Current Architecture

**Current stack:** Next.js 15 App Router, TypeScript, Supabase Auth/DB/Storage, Tailwind CSS, React Hook Form, Zod, and TanStack React Query.

**Target stack:** Next.js on DigitalOcean, Neon Postgres, private Azure Blob Storage containers, Auth.js, server-only data access, and database-backed revocable sessions.

### Current Role System

| Role | Layout | Root path |
|---|---|---|
| `admin` | `AdminLayout` | `/pages/admin` |
| `expert` | `ExpertDashboardLayout` | `/pages/expert/clients` |
| `company_owner` | `DashboardLayout` | `/pages/agency` |
| `care_coordinator` | `DashboardLayout` | `/pages/agency/clients` |
| `staff_member` | `StaffLayout` | `/pages/caregiver` |

Roles currently live in `user_profiles`. Protected pages are server components that use `requireAdmin()` from `src/lib/auth-helpers.ts` or `getSession()` from `src/lib/auth.ts` followed by a role check.

### Authorization Rules During Migration

- Preserve agency-level data isolation at every stage.
- Do not trust a client-provided role, agency ID, patient ID, document ID, or storage key as authorization.
- Authorize every server action and API route against server-loaded data.
- Treat `active`, `invited`, and `pending` memberships as separate states; never grant PHI access merely because a membership row exists.
- Maintain the existing RLS protections until every business query is server-only. In the Neon target, use central server authorization and add database RLS for PHI tables as defense in depth.
- Protected-route middleware must fail closed. It may redirect only after a verified session check; it must not continue a protected request after an authentication error.

## Provider Boundaries

External infrastructure is accessed only through application-owned interfaces. Do not import a vendor SDK into business logic, UI components, or domain services.

| Capability | Current boundary | Target boundary |
|---|---|---|
| Auth | `src/lib/auth.ts`, `src/lib/auth-helpers.ts` | Same public interface backed by Auth.js |
| Database | `src/lib/supabase/query/` | Server-only repository/query layer backed by Neon |
| Storage | `src/lib/storage/` | Server-authorized Azure Blob Storage adapter |
| Email | `src/lib/email/` | Provider adapter under `src/lib/email/` |
| Logging/jobs/analytics | `src/lib/` wrapper | Provider adapter under `src/lib/` |

Never expose privileged credentials to the browser. Never use `createAdminClient()` to work around an RLS gap. If a role needs access, correct the policy or the server authorization rule.

### Supabase Clients While They Remain

| Client | File | Intended use |
|---|---|---|
| Server client | `src/lib/supabase/server.ts` | Normal server-side reads/writes respecting RLS |
| Admin client | `src/lib/supabase/admin.ts` | Genuine service-level operations only |
| Browser client | `src/lib/supabase/client.ts` | Transitional live subscriptions only; do not add new business queries |

RLS-blocked UPDATE or DELETE calls can return no error when no rows are affected. Verify sensitive mutations by selecting the changed row or checking the affected count.

## Query, Server Action, and Cache Conventions

Current Supabase queries belong in `src/lib/supabase/query/` and are re-exported from its barrel file. New Neon data access must be server-only and belong in a new application-owned query/repository layer; do not write ad hoc database calls in pages or client components.

Server actions must:

1. Authenticate and authorize before reading or mutating protected data.
2. Validate input server-side using the shared Zod schema.
3. Return `{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }` for form operations.
4. Revalidate every affected role route and applicable cache tag after mutation.
5. Write required audit events without logging PHI content.

Reference-list caching lives in `src/lib/server-cache/`; cache tags live in `src/lib/cache-tags.ts`. Revalidate relevant tags after mutations.

## Forms and Validation

Use React Hook Form and shared Zod schemas for all forms.

- Put schemas in `src/lib/schemas/<domain>.ts`; import the same schema into the component and server action.
- Use `useForm({ resolver: zodResolver(schema), mode: 'onBlur' })` and `noValidate` on forms.
- Render field errors inline. Use Sonner only for non-field server errors and success.
- Server actions use `safeParse` and `zodErrorToFieldErrors` from `src/lib/validation`.
- Client forms use `setError` to surface returned `fieldErrors` on the relevant field.
- Required labels include a red `*`.

For user-facing phone and email capture, use `PhoneInput` and `EmailInput` from `src/components/ui/`, with `phoneZodField`, `emailZodField`, or `optionalEmailZodField` from `src/lib/validation`. Do not use raw user-facing tel/email inputs.

When changing a form or modal, audit it for the pattern above. Explicitly tell the user about missing shared-schema, validation, or error-handling pieces; do not silently leave a partly migrated form.

## Configurable Dropdowns

Use `configuration_types` and `configuration_values` for administrator-managed display/reference data that does not drive application logic. Use TypeScript constants or database enums for statuses and values that control behavior.

- Use stable `code` values whenever application logic needs to identify a configurable value.
- `parent_id` supports cascading lists; top-level values have `parent_id = NULL`.
- Fetch values through `getConfigurationValues(typeCode)` and pass the normalized `{ id, name, subcategories }` shape to components.
- Add a new list by inserting a type, seeding values, adding `ConfigurableListSection`, and fetching with the shared action. Do not add a new table for a normal configurable list.

## Storage Rules

All uploads, downloads, deletes, and signed URLs go through `src/lib/storage/`.

- Do not call `supabase.storage.*` or future Azure Blob Storage SDK calls directly from pages, components, or domain services.
- All protected buckets are private.
- Generate object keys server-side and store ownership metadata in the database.
- Issue short-lived signed URLs only after server authorization against the database record and agency scope.
- Never expose a generic endpoint that signs an arbitrary object key.
- Validate file type and size server-side; add malware scanning before accepting PHI-bearing documents.
- Audit uploads, downloads, URL issuance, deletion, and failed access attempts.

## Auth.js Target Requirements

When the authentication phase begins:

- Use Auth.js with database-backed opaque sessions in Neon, not long-lived authorization JWTs.
- Validate active user status and current membership/role permissions at request time or with a short, revocable cache.
- Revoke sessions on deactivation, role/membership change, password reset, logout-all, and security response.
- Use invite-only provisioning for privileged users. Do not allow public selection of `admin`, `expert`, or any privileged role.
- Prefer WebAuthn/passkeys for MFA, with TOTP as fallback. Email codes may be transitional or recovery only.
- Passwords use Argon2id, reset tokens are high-entropy and hashed at rest, and recovery invalidates existing sessions.
- Login, MFA, password reset, invitation, and recovery flows need durable account and IP rate limits.
- Never use a fixed password marker, client flag, or callback query parameter as proof of MFA completion.

## Security and HIPAA Rules

Never:

- Log PHI: names, addresses, DOB, notes, visit details, documents, or record contents.
- Store PHI in localStorage, sessionStorage, analytics, error-monitoring payloads, test fixtures, GitHub, or CI output.
- Expose `SUPABASE_SERVICE_ROLE_KEY`, Neon credentials, Azure Blob Storage credentials, or future provider secrets to clients.
- Bypass tenant isolation, server-side validation, or authorization checks.
- Make patient, caregiver, visit, certification, or document storage public.
- Add a third-party integration that could receive PHI without explicit approval and BAA confirmation.
- Add `console.log` output containing user, patient, caregiver, visit, or document data.

Always:

- Preserve agency-level isolation and least privilege.
- Use signed URLs for protected documents.
- Add audit events for authentication, role and permission changes, visits, time entries, approvals, assignments, rates, documents, exports, and PHI reads/writes.
- Keep caregiver-visible notes separate from agency-only notes.
- Prefer immutable audit history over destructive updates.
- Keep GitHub free of PHI, production data dumps, screenshots with sensitive records, and secrets.

For internal note search/filter UI, call `logNoteSearchAction` from `src/app/actions/internal-notes.ts`, debounce at least 600 ms, and log searches of three or more characters with `action='SEARCH'`, `table_name='internal_notes'`, and the required non-content trace metadata.

## Audit and Compliance Log

Whenever work affects permissions, access controls, authentication, audit requirements, or PHI-related records, read and then update `docs/hipaa/compliance-log.md`.

The update records:

1. The factual change.
2. The applicable 45 CFR 164.312 safeguard or other relevant provision.
3. The files changed.
4. Any identified compliance gap and its remediation.

Treat audit logs as sensitive, append-only evidence. Log who accessed which resource and when, but do not log the PHI itself.

## Change Discipline

Before making changes:

1. Read relevant existing files and search for existing patterns.
2. Identify database, auth, RLS, storage, API, cache, and compliance impact.
3. Do not rename tables, columns, routes, or shared types unless explicitly requested.
4. Preserve unrelated user changes in a dirty worktree.
5. Keep edits scoped and verify in proportion to risk.

During the Supabase-to-Neon migration, treat all schema, data-access, auth, storage, and deployment changes as controlled migration work. Do not mix unrelated feature work into a migration slice.
