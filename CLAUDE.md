# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
| `createAdminClient()` | `src/lib/supabase/admin.ts` | Bypasses RLS — use only when RLS would block a legitimate server operation (e.g. reading `agency_admins` for admin/expert views) |
| Browser client | `src/lib/supabase/client.ts` | Client components that need live subscriptions |

Never expose `createAdminClient()` output to the browser.

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

**Before making any change:**
1. Read the relevant existing files first.
2. Identify any DB, auth, RLS, or API surface impact.
3. Do not rename tables, columns, routes, or shared types unless explicitly asked.
