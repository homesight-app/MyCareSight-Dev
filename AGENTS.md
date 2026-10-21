# AGENTS.md

This file provides project guidance for Codex and other coding agents working in this repository.

## Current Migration Context

The active migration is UAT-only: Azure App Service in subscription **MyCareSight-Dev-UAT** (`a268ab63-b7ec-490d-a858-0de0be69ed4f`), Neon Postgres, Azure Blob Storage, and GitHub. The local migration branch has removed the Supabase SDK and runtime settings: business data uses Neon, authentication uses Auth.js with Neon-backed opaque sessions, and files use the application-owned Azure Storage boundary. Deployment and UAT acceptance gates remain.

Production remains on Supabase and Vercel in a separate repository. Prepare this work through local file changes; do not deploy to production, copy production data, revoke shared credentials, or design the production migration yet. The earlier DigitalOcean hosting target is not part of this UAT slice. See [UAT migration status](docs/migrations/uat-supabase-removal.md) for the approved sequence, evidence, and outstanding gates.

The current application has internal platform administrators only. Do not add real agency, caregiver, patient, visit, document, or other PHI data to new non-HIPAA environments. The pre-HIPAA migration environment must contain only synthetic or otherwise non-PHI data.

The migration order is deliberate:

1. Decouple business-data access from Supabase while temporarily retaining internal Supabase authentication.
2. Move Storage behind application-owned server interfaces and migrate it to Azure Blob Storage.
3. Keep the UAT application deployable on Azure App Service; do not change hosting in this slice.
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

## UI Design System and Cross-Portal Consistency

The objective of UI design-system work is to improve visual consistency,
centralized styling, accessibility, and maintainability without changing
application functionality. Application stability and functional preservation
take priority over architectural perfection or complete design-system adoption.
These requirements apply across HomeSights Admin, Licensing Expert, Agency
Admin, Care Coordinator, Caregiver, authentication, onboarding, and public
experiences.

### Functional Preservation

UI refactoring must not intentionally alter:

- Business logic or calculations.
- Database queries, schemas, migrations, API contracts, or server actions.
- Authentication, authorization, role permissions, tenant isolation, or PHI
  security controls.
- Form validation rules or submission behavior.
- Existing workflow steps, navigation destinations, or available user actions.
- Data filtering, sorting, pagination, persistence, uploads, downloads, or
  storage behavior.

Accessibility improvements may deliberately change keyboard or focus behavior,
but they must preserve business behavior and receive focused regression and
accessibility testing.

### Centralized Design Foundations

- Use centrally defined design-system values and variants when an applicable
  standard exists. Do not add hardcoded colors, arbitrary dimensions, or
  duplicated styling rules to standard controls when a shared token or variant
  covers the need.
- Centralized definitions should cover primary and secondary actions, semantic
  success, warning, danger, and information colors, text and surfaces, borders,
  typography roles, spacing, control sizes, radii, shadows and elevation,
  focus, responsive breakpoints, and standard or compact density.
- Specialized visualizations, third-party widgets, and domain-specific controls
  may use documented exceptions when the shared system is not appropriate.
- New tokens or theme behavior require an approved implementation batch. The
  current governance phase documents the intended architecture only.

### Shared Component Reuse

- Follow [Reuse Before Building](#reuse-before-building): search
  `src/components/ui/` and relevant feature components before creating a
  visual or interaction pattern. Reuse or extend an existing equivalent instead
  of introducing a parallel implementation.
- Prefer shared foundations for buttons and icon buttons, tables and data-list
  controls, form fields, selects and dates, dialogs, cards, page headers, tabs,
  navigation, badges, feedback states, search, filters, and pagination.
- Do not force specialized calendars, editors, charts, reports, or clinical and
  visit interactions into a generic component that does not fit their behavior.
- Presentation primitives must not own business rules, data access,
  authorization, tenant scope, persistence, or workflow orchestration.

### Buttons, Tables, Forms, and Dialogs

- Treat `src/components/ui/PrimaryButton.tsx` as the canonical shared-button
  foundation. Use its existing variants for new standard buttons. Renaming or
  changing its public API requires separate approval and a compatibility plan.
- Follow `src/components/ui/TABLES.md`. Keep business-specific columns,
  filtering rules, sorting semantics, pagination semantics, and row workflows
  in the owning feature. Do not force every table into one rigid data-grid
  abstraction.
- Follow [Forms and Validation](#forms-and-validation). Standardize labels,
  required indicators, help text, control sizing, field spacing, focus states,
  error presentation, validation accessibility, and disabled/read-only states
  through approved shared controls while preserving React Hook Form, Zod,
  validation rules, submission behavior, and server error mapping.
- Use the existing shared modal foundation for new modal interactions when it
  fits. Do not add manual modal shells without a documented reason. Dialog
  semantics, focus containment, keyboard behavior, initial focus, and focus
  return are future accessibility work that requires separate approval and
  focused tests.

### Typography, Layout, and Portal Variants

- Use documented roles for page titles, section headings, body text, labels,
  helper text, table text, captions, and numeric metrics as those roles are
  approved and implemented. Each route should have one meaningful primary
  heading.
- Do not change the current global 14px root font size as an incidental UI
  refactor. A root typography change requires separate approval and broad
  visual, responsive, zoom, and workflow regression testing.
- The same kind of control should share a visual foundation across portals.
  Intentional variants are allowed when workflow or usability requires them,
  including larger caregiver touch targets, compact report tables, distinct
  public/auth presentation, FullCalendar and TipTap adapters, and domain-specific
  visit status indicators. Document intentional variants instead of creating
  unexplained duplicates.

### Theme and White-Label Boundaries

- Keep global design foundations, tenant theme inputs, and controlled component
  variants separate. Theme customization must never affect business logic,
  authorization, data access, tenant isolation, or workflow behavior.
- Future tenant-selected colors must be constrained and validated for contrast
  in normal, hover, selected, disabled, and focus states.
- Do not introduce new theme behavior without explicit approval and a defined
  fallback. Documentation of a proposed theme architecture does not mean it is
  implemented.

### Accessibility

- Preserve or improve keyboard operation, visible focus, accessible names,
  dialog semantics, form error associations, table-sort semantics,
  screen-reader announcements, responsive accessibility, zoom behavior, and
  touch target sizing.
- Keep accessibility changes separate from unrelated business-logic changes
  where practical. Test deliberate interaction changes against existing mouse,
  keyboard, touch, and workflow behavior.

### Incremental Refactoring

- Do not perform bulk UI rewrites or combine UI refactoring with feature
  development.
- Make changes in small, independently testable batches.
- Prefer improving existing shared components while preserving their public
  APIs.
- Existing screens do not need rewrites merely to reach complete adoption.
  Prefer opportunistic migration during normal maintenance for lower-value
  inconsistencies.
- Preserve current behavior unless the user explicitly approves a specific
  change.

### Required Validation

Before changing an existing component:

1. Identify its consumers and dependencies.
2. Document its current props, callbacks, and behavior.
3. Identify the affected workflows and portals.
4. Confirm relevant regression coverage exists or add proportionate coverage.
5. Capture existing visual behavior with synthetic data where practical.

After changing it:

1. Run TypeScript checks.
2. Run relevant unit and integration tests.
3. Run linting.
4. Run the affected Playwright end-to-end tests.
5. Verify keyboard and accessibility behavior where applicable.
6. Compare before-and-after screenshots when appearance changes.

Shared-component changes should gain proportionate TypeScript, unit,
integration, Playwright, accessibility, and visual-regression coverage. Use
only synthetic, non-PHI fixtures and screenshots. Follow [Commands](#commands),
and report every check that was not run and why. Never claim a check passed when
it did not execute successfully.

### Critical Workflow Protection

Exercise additional caution with authentication and authorization, agency
onboarding, licensing applications and documents, client and caregiver records,
scheduling, EVV clock-in and clock-out, caregiver visit execution,
documentation and uploads, payroll and billing, and tenant-specific data
visibility. Do not refactor these workflows merely for visual consistency. If a
visual improvement requires changing underlying behavior, document it as a
separate work item requiring explicit approval. Never use production PHI in
screenshots, tests, fixtures, or debugging output.

### Change Control, Phase Gates, and Reporting

For every implementation batch, report:

- Files modified.
- Components, workflows, and portals affected.
- Intended visual changes.
- Any deliberate functional or accessibility behavior changes.
- Tests executed and their results.
- Tests not executed and why.
- Known risks and the rollback approach.

Stop and request approval before changes involving business logic, public
component APIs, database behavior, authorization, or unexpected failures. Do
not advance automatically between design-system phases. At each phase boundary,
report benefits, remaining inconsistencies, risks, next-phase value, and a
recommendation of `PROCEED`, `PROCEED SELECTIVELY`, or `STOP`, then obtain
explicit approval.

### Rollback

- Perform UI design-system implementation on a dedicated Git branch.
- Keep changes in small, reviewable commits that can be reverted independently.
- Do not deploy automatically.
- Do not merge into the production branch without approval.

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

**UAT target stack:** Next.js on Azure App Service, Neon Postgres, private Azure Blob Storage containers, Auth.js, server-only data access, and database-backed revocable sessions.

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

## Sensitive Data Encryption Boundary

When a field requires application-level encryption, reuse
`src/lib/security/sensitive-field-cipher.ts`. Do not create a second cipher,
embed cryptographic keys in business logic, or import an Azure/provider SDK into
pages, components, actions, or domain repositories.

- Encryption and decryption are server-only and occur only after the caller and
  target record have been authorized.
- Use AES-256-GCM through the shared boundary. Every write must use a fresh
  96-bit nonce and authenticated context that binds the deployment environment,
  agency, record, and field purpose.
- Persist the versioned envelope produced by the shared cipher, including the
  algorithm, key identifier, nonce, authentication tag, and ciphertext. Do not
  invent a field-specific envelope format.
- Azure deployments use an environment-specific Key Vault through Managed
  Identity. Business code depends only on `SensitiveDataKeyProvider`; provider
  selection and Key Vault access remain inside the security boundary.
- Local and automated environments may use the environment provider only with
  synthetic, non-production keys. Never copy a UAT or production data key into a
  developer environment, test fixture, GitHub secret, or CI output.
- Rotate by creating a new version of the configured Key Vault secret. New
  writes use the latest version, while historical versions remain enabled until
  every dependent ciphertext has been re-encrypted or lawfully retired.
- Plaintext and ciphertext must not appear in logs, telemetry, audit details,
  analytics, error messages, URLs, client storage, or test fixtures. Store a
  masked derivative such as the last four digits only when the workflow needs it
  and authorize that derivative separately.
- Add focused tests for round-trip encryption, nonce uniqueness, tampering,
  authenticated-context mismatch, historical-key decryption, provider failure,
  and unauthorized access before introducing a new encrypted field.
- Update `docs/operations/sensitive-data-key-management.md`, the relevant
  migration documentation, `docs/migrations/future-production-port-impact-register.md`,
  and `docs/hipaa/compliance-log.md` when a new encrypted data class or key is
  introduced.

Field-level encryption is based on data sensitivity and the documented threat
model; it is not a substitute for data minimization, tenant authorization, RLS,
TLS, database encryption at rest, private storage, or audit controls.

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

Prefer durable, scalable fixes that address the underlying cause over temporary
workarounds or repeated manual configuration steps. Reuse application-owned
boundaries, validate configuration at the point of use, and add proportionate
regression coverage. Keep solutions scoped and avoid speculative infrastructure
or unnecessary complexity. If a workaround is unavoidable, identify it explicitly
and record the permanent remediation.

Before making changes:

1. Read relevant existing files and search for existing patterns.
2. Identify database, auth, RLS, storage, API, cache, and compliance impact.
3. Do not rename tables, columns, routes, or shared types unless explicitly requested.
4. Preserve unrelated user changes in a dirty worktree.
5. Keep edits scoped and verify in proportion to risk.

During the Supabase-to-Neon migration, treat all schema, data-access, auth, storage, and deployment changes as controlled migration work. Do not mix unrelated feature work into a migration slice.
