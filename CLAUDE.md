# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## New Feature mode

When the user starts a message with **"New Feature:"**, switch into business analyst + technical architect mode before any implementation:

1. **Ask clarifying questions** to fully understand the goal — who uses it, what problem it solves, edge cases, scale expectations, and any constraints (roles, permissions, HIPAA, existing data).
2. **Propose a design** covering: data model changes (tables/columns), which roles can access it, UI entry points, server action shape, and any third-party integrations needed.
3. **Suggest alternatives or enhancements** the user may not have thought of that would make the feature more scalable, easier to use, or better aligned with the existing architecture.
4. **Do not write any code** until the user confirms the design. Use plan mode (`EnterPlanMode`) to capture the agreed design before implementation begins.

The goal is a feature that is scalable, modern, and easy for end users — not just the quickest path to working code.

---

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # TypeScript check (no emit)
npm run lint         # ESLint
```

There is no test framework configured — verify correctness with `typecheck` + `build`.

Before marking any work complete, always run:
```bash
npm run lint && npm run typecheck && npm run build
```

---

## Database schema — always use live DB, not migration files

**The migration files in `supabase/migrations/` are not authoritative.** They may be out of date, partially applied, or missing columns added directly in the Supabase dashboard. Always query the live database for the actual schema before writing or reviewing any SQL column references.

**Use the Supabase MCP connection** (`mcp-server-supabase`, project ref `ruidwstxnkgajavxsyft`) to inspect the real schema:
- `list_tables` — list all tables in a schema
- `execute_sql` — query `information_schema.columns` for exact column names, types, and nullability

**If the MCP connection fails or the tools are unavailable, stop and tell the user immediately.** Do not fall back to migration files as a substitute for live schema. Any column reference written without live DB verification risks silent data loss (wrong column name = RLS-silent no-op update) or NOT NULL insert failures.

This rule applies to:
- Writing or reviewing `select()` column lists
- Writing `insert` or `upsert` payloads
- Checking whether a column is nullable before omitting it from a payload
- Verifying column names when fixing bugs in DB queries

---

## Architecture

**Stack:** Next.js 15 App Router · TypeScript · Supabase (auth + DB + storage) · Tailwind CSS · React Hook Form + Zod · TanStack React Query

### Role system

Five roles defined in `src/types/auth.ts`:

| Role | Layout component | Root path |
|------|-----------------|-----------|
| `admin` | `AdminLayout` | `/pages/admin` |
| `expert` | `ExpertDashboardLayout` | `/pages/expert/clients` |
| `company_owner` | `DashboardLayout` | `/pages/agency` |
| `care_coordinator` | `DashboardLayout` | `/pages/agency/clients` |
| `staff_member` | `StaffLayout` | `/pages/caregiver` |

Roles are stored in the `user_profiles` table and checked server-side on every protected page.

### Page protection pattern

Every protected page is a **server component** that runs one of these checks before rendering:

```ts
// Admin-only
const { user, profile } = await requireAdmin()          // src/lib/auth-helpers.ts

// Any authenticated role with manual check
const session = await getSession()                       // src/lib/auth.ts
if (!session) redirect('/pages/auth/login')
if (session.profile?.role !== 'expert') redirect('/pages/expert/clients')
```

`requireAdmin()` redirects non-admins to `/pages/agency`. Use `getSession()` for other roles and add the role check yourself.

### Supabase clients — pick the right one

| Client | File | When to use |
|--------|------|-------------|
| `createClient()` | `src/lib/supabase/server.ts` | All normal server-side reads/writes; respects RLS |
| `createAdminClient()` | `src/lib/supabase/admin.ts` | Bypasses RLS — only for genuine service-level operations (creating data on behalf of another user, cross-agency admin operations) |
| Browser client | `src/lib/supabase/client.ts` | Client components that need live subscriptions |

Never expose `createAdminClient()` output to the browser.

**`createAdminClient()` is not a workaround for missing RLS policies.** If a role legitimately needs access to a table but RLS blocks it, write a migration to add the policy — do not reach for the admin client. Using the admin client to paper over an RLS gap leaves the gap permanently unfixed and creates a false sense of security.

**RLS-blocked mutations fail silently.** Supabase returns `{ error: null }` when an UPDATE or DELETE is blocked by RLS if the query has no `.select()` after it — 0 rows are affected but no error is raised. Always verify mutations by adding `.select()` or checking affected row count, especially in server actions used by non-admin roles.

### Auth boundary — keep Supabase auth imports inside `src/lib/`

Never import from `@supabase/supabase-js` or call `supabase.auth.*` directly in pages, components, or server actions. All auth operations must go through the wrappers in `src/lib/auth.ts` and `src/lib/auth-helpers.ts`:
- Session access → `getSession()` (`src/lib/auth.ts`)
- Admin-only page guard → `requireAdmin()` (`src/lib/auth-helpers.ts`)
- User creation / password changes → action functions in `src/app/actions/agency-users.ts` and `src/app/actions/users.ts`

This keeps the auth provider (currently Supabase) swappable from a single layer. When NextAuth replaces Supabase auth, only `src/lib/auth.ts`, `src/lib/auth-helpers.ts`, and the Supabase client files need to change — no pages or components.

### Storage — always go through `src/lib/storage/`

Never call Supabase Storage SDK methods (`supabase.storage.*`) directly in pages, components, or server actions. All file upload, download, deletion, and signed-URL generation must go through wrapper functions in `src/lib/storage/` (create this module if it does not exist yet).

This keeps the storage provider (currently Supabase Storage) swappable. When migrating to S3-compatible storage on Aptible, only `src/lib/storage/` needs to change.

### Query layer (`src/lib/supabase/query/`)

All DB access goes through named functions in this directory. Each function takes a Supabase client as its first argument and returns `Promise<{ data: T | null, error: PostgrestError | null }>`. The barrel `index.ts` re-exports everything — import as `import * as q from '@/lib/supabase/query'`.

### Server actions (`src/app/actions/`)

Server actions follow this shape:

```ts
'use server'
export async function doSomething(payload: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // ... call q.someQuery(supabase, ...)
  revalidatePath('/pages/affected-route')
  revalidateTag(CACHE_TAG_SOMETHING)          // src/lib/cache-tags.ts
  return { error: null, data: { success: true } }
}
```

Always `revalidatePath` every role's route that displays the mutated data (e.g. both `/pages/admin/agencies` and `/pages/expert/agencies`).

### Caching

Reference-list data (agencies, license requirements, etc.) is cached with Next.js `unstable_cache` in `src/lib/server-cache/`. Cache tags are defined in `src/lib/cache-tags.ts`. Call `revalidateTag(TAG)` in server actions after mutations.

### Middleware (`src/middleware.ts`)

Runs on every request except `_next/static`, `_next/image`, and `favicon`. Calls `updateSession()` from `src/lib/supabase/middleware.ts` to refresh Supabase auth cookies. Public paths (login, signup, reset-password, `/`, `/auth/callback`) are the only routes that don't require a session — all redirects for unauthenticated users happen here.

### Forms

Use **React Hook Form** + **Zod** for all forms. Schemas live co-located with the component or in the component file itself. Server validation is always the source of truth; client-side Zod is UX only.

### Phone and email fields — always use the shared components and schemas

**Never** use a plain `<input type="tel">` or `<input type="email">` directly for user-facing phone or email capture. Always use the shared components in `src/components/ui/`:

| Component | File | Use for |
|-----------|------|---------|
| `PhoneInput` | `src/components/ui/PhoneInput.tsx` | Every phone/fax number field |
| `EmailInput` | `src/components/ui/EmailInput.tsx` | Every email address field |

`PhoneInput` auto-formats to `(XXX) XXX-XXXX` as the user types, renders `type="tel"` and a standard placeholder, and displays an inline `error` prop below the field. `EmailInput` does the same for email with `type="email"`.

**RHF forms** — use `mode: 'onBlur'` on `useForm` so validation fires on blur, then spread `register` directly into the component:

```tsx
import PhoneInput from '@/components/ui/PhoneInput'
import EmailInput from '@/components/ui/EmailInput'

const { register, formState: { errors } } = useForm({ mode: 'onBlur', resolver: zodResolver(schema) })

<PhoneInput {...register('phone')} error={errors.phone?.message} className="..." />
<EmailInput {...register('email')} error={errors.email?.message} className="..." />
```

**Plain state forms** — pass `value` and `onChange` (event handler); `e.target.value` is already formatted:

```tsx
<PhoneInput
  value={form.phone}
  onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
  error={fieldErrors.phone}
  className="..."
/>
```

**Zod schemas** — use the pre-built field schemas from `src/lib/validation.ts` instead of re-writing the regex refine:

```ts
import { phoneZodField, emailZodField, optionalEmailZodField } from '@/lib/validation'

const schema = z.object({
  phone: phoneZodField,           // optional, validates format if non-empty
  email: emailZodField,           // required valid email
  alt_email: optionalEmailZodField, // optional, validates format if non-empty
})
```

**Server-side / submit-time validation** for plain state forms — use `isValidUSPhone` and `isValidEmail` from `src/lib/validation.ts` as a final guard before calling server actions.

---

## HIPAA / Security rules

**Never:**
- Log PHI (names, addresses, DOB, notes, visit details, documents) anywhere.
- Store PHI in `localStorage`, `sessionStorage`, analytics, or error-monitoring payloads.
- Expose the service role key (`SUPABASE_SERVICE_ROLE_KEY`) to the client.
- Bypass Supabase RLS without an explicit `createAdminClient()` call on the server.
- Create public storage buckets for patient, caregiver, visit, certification, or document files.
- Add third-party tools that may receive PHI without approval.
- Add `console.log` statements containing user, patient, caregiver, visit, or document data.

**Always:**
- Use server-side validation for sensitive actions.
- Preserve agency-level data isolation.
- Respect existing RLS policies.
- Use signed URLs for protected documents.
- Add audit logging for changes to visits, time entries, approvals, assignments, rates, and documents.
- Keep caregiver-visible notes separate from agency-only notes.
- Prefer immutable audit history over destructive updates.
- **Audit note searches (HIPAA § 164.312(b)):** Any UI that lets staff search or filter `internal_notes` must call `logNoteSearchAction` (debounced ≥ 600 ms, fires when term is ≥ 3 chars). Log `action='SEARCH'`, `table_name='internal_notes'`, and `details: { search_term, results_returned, subject_type, subject_id }` so auditors can reconstruct who searched for what PHI and what was returned. This is required for HIPAA investigation traceability. Implementation: `src/app/actions/internal-notes.ts → logNoteSearchAction`.

**Before making any change:**
1. Read the relevant existing files first.
2. Identify any DB, auth, RLS, or API surface impact.
3. Do not rename tables, columns, routes, or shared types unless explicitly asked.

### RLS policy guidelines

RLS is the primary access control layer. Keep it correct rather than working around it.

- Every table must have explicit SELECT/INSERT/UPDATE/DELETE policies for each role that legitimately needs access.
- When adding a new feature that reads from a table a role hasn't accessed before, check whether an RLS SELECT policy exists for that role. If not, write a migration — do not use `createAdminClient()`.
- When writing a server action that mutates data and is called by a non-admin role, use `createClient()` (RLS client). If RLS blocks it, determine whether the role *should* have access (fix the policy) or *should not* (add an explicit server-side role guard instead of bypassing).
- `createAdminClient()` is appropriate when: creating/modifying data on behalf of another user (e.g. admin creating an application for an agency), reading data the role has UI access to but whose RLS is not yet defined (temporary, must be paired with a migration ticket), or operations that inherently span multiple users.
- Migration files live in `supabase/migrations/phase_two/`. Increment the prefix number. Run them in the Supabase SQL editor. The `is_platform_staff()` function (covers `admin` and `expert` roles) and `is_agency_member(agency_id)` are available for use in policies.
