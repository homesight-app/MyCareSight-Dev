# HIPAA Compliance Log

This document records features and implementations that address HIPAA Security Rule
(45 CFR § 164.312) requirements. It is maintained by Claude Code alongside feature
development and is intended to serve as a living evidence trail for compliance officers
and auditors.

---

## Provision Reference

| Provision | Requirement |
|-----------|-------------|
| § 164.312(a)(1) | Access Control — implement technical policies to allow only authorized persons or software programs to access ePHI |
| § 164.312(a)(2)(i) | Unique User Identification — assign a unique name or number to identify and track user identity |
| § 164.312(a)(2)(ii) | Emergency Access Procedure — establish procedures for obtaining ePHI during an emergency |
| § 164.312(b) | Audit Controls — implement hardware, software, and procedural mechanisms to record and examine activity in systems that contain or use ePHI |
| § 164.312(c)(1) | Integrity — implement policies and procedures to protect ePHI from improper alteration or destruction |
| § 164.312(d) | Person/Entity Authentication — implement procedures to verify that a person seeking access is the one claimed |
| § 164.312(e)(1) | Transmission Security — implement technical security measures to guard against unauthorized access to ePHI transmitted over electronic communications networks |

---

## § 164.312(a)(1) — Access Control

### Neon RLS + Query Bridge — patients Table Agency Data Isolation (Phase 4.5, 2026-09-15)
- **What:** Prepared and audited the application changes and checked-in Neon SQL needed to enable PostgreSQL Row Level Security on the `patients` table, the first table in the Phase 4.5 pilot. Once `scripts/rls-patients-enable.sql` is run and verified in Neon under a non-`BYPASSRLS` runtime role, policy `patients_agency_rls` will enforce that agency-scoped roles (`company_owner`, `care_coordinator`, `staff_member`) can only read and write patients belonging to their own agency. `admin` and `expert` roles retain full access. `FORCE ROW LEVEL SECURITY` protects against ordinary table-owner bypass, but not against roles granted `BYPASSRLS`.
- **Session variable injection:** `withUserContext` (`src/db/index.ts`) opens a `postgres.js` transaction, sets `app.current_user_role` and `app.current_agency_id` via `SET LOCAL` (transaction-scoped — safe with connection pooling), and runs the query inside `AsyncLocalStorage`. All `sql\`...\`` calls inside propagate through the Proxy automatically.
- **Policy SQL:** `NULLIF(current_setting('app.current_agency_id', true), '')::uuid` — single expression, safe when the variable is empty.
- **Rollback:** `scripts/rls-patients-disable.sql` drops the policy and disables RLS in one transaction.
- **Status:** The Neon database change is pending manual execution and verification. Append a separate evidence entry after the enable script and verification queries have been run.

**Server actions updated to call `withUserContext`:**
- `src/app/actions/visit-candidates.ts` — **critical gap fixed**: action had no session check at all; added auth, agency ownership verification for the visit, and agency-scoped `caregiver_members` filter
- `src/app/actions/patient-documents.ts` — **auth-before-storage ordering fixed**: now authorizes patient ownership via `withUserContext` + RLS *before* touching Azure Blob Storage; path traversal guard added; `deleted_path` (PHI filename) removed from audit log
- `src/app/actions/patient-addresses.ts` — cross-patient address edit prevented by verifying `address.patient_id` server-side before update; PHI payload spread (`...payload`) removed from update audit log; all 4 functions wrapped
- `src/app/actions/payroll-billing-report.ts` — removed redundant `getViewerAgencyId()` helper (was calling `getSession()` twice + extra DB round-trip); wrapped patient-querying functions in `withUserContext`
- `src/app/actions/caregiver-visit-execution.ts` — `getCaregiverPastVisitSummaryAction` wrapped

**`unstable_cache` + AsyncLocalStorage fix:**
- `src/lib/server-cache/caregiver-visit-execution-detail.ts` — `withUserContext` called *inside* the `unstable_cache` callback; `viewerRole` added as cache-key param so each user gets their own cached result and RLS context is set on every cache miss

**Pages updated (add `withUserContext` wrapping, remove dead `createClient` imports):**
- `src/app/pages/agency/clients/page.tsx`
- `src/app/pages/agency/clients/[id]/page.tsx`
- `src/app/pages/agency/time-billing/page.tsx`
- `src/app/pages/agency/care-visits/page.tsx`
- `src/app/pages/caregiver/my-care-visits/page.tsx`
- `src/app/pages/caregiver/my-care-visits/[visitId]/page.tsx`

**Dashboard agency scoping:**
- `src/lib/visit-assignment-dashboard.ts`, `src/lib/visit-all-visits-dashboard.ts`, `src/lib/supabase/query/schedule-assignment-requests.ts`, and `src/app/actions/care-visits-badge.ts` now explicitly scope scheduled visits, caregiver lists, assignment/unassignment requests, aggregate counts, and the sidebar pending badge by agency.
- `src/lib/time-billing-dashboard.ts` — added `agencyId` parameter to filter `scheduled_visits` by `agency_id`, preventing cross-agency visit data leakage in the time-billing report

**Legacy browser Supabase client paths converted to server actions:**
- `src/components/CaregiverProfileContent.tsx:208` — replaced `supabase.from('patients').select(...)` with `getPatientNamesByIdsAction` server action
- `src/components/InternalNotesPanel.tsx:249` — replaced `supabase.from('patients').select(...)` with `getAgencyPatientNamesAction` server action
- Both new actions are in `src/app/actions/patients.ts` and use `withUserContext` for RLS enforcement

**Files changed:** `src/db/index.ts` (pre-existing), `src/app/actions/visit-candidates.ts`, `src/app/actions/patient-documents.ts`, `src/app/actions/patient-addresses.ts`, `src/app/actions/payroll-billing-report.ts`, `src/app/actions/caregiver-visit-execution.ts`, `src/app/actions/patients.ts`, `src/lib/server-cache/caregiver-visit-execution-detail.ts`, `src/lib/time-billing-dashboard.ts`, 6 page files, 2 component files, `scripts/neon-runtime-role-setup.sql`, `scripts/rls-patients-enable.sql`, `scripts/rls-patients-disable.sql`

---

## § 164.312(b) — Audit Controls

### Azure Blob Storage Target Recorded (2026-09-03)
- **What:** The approved target for private document storage changed from Cloudflare R2 to Azure Blob Storage. This is a migration-design decision only; no application storage code, access path, or live data changed.
- **Required design:** The future Azure adapter remains behind `src/lib/storage/`; private containers, server-authorized short-lived SAS URLs, database-backed ownership and agency checks, and audit events for upload, download, URL issuance, deletion, and denied access are required before PHI/ePHI is introduced.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(e)(1) Transmission Security.
- **Files changed:** `AGENTS.md`, `docs/migrations/step-1-migration-control.md`, `docs/hipaa/compliance-log.md`.
- **Gap and remediation:** A BAA/contractual eligibility review, Azure account and tenant configuration, encryption/key-management decisions, private networking, retention, recovery, monitoring, and incident-response controls remain unverified. They are required before Azure Blob Storage may contain PHI/ePHI.

### Public Self-Service Registration Disabled (2026-09-03)
- **What:** Disabled public self-service registration. Middleware no longer treats `/pages/auth/signup` or legacy `/signup` as public paths, and the signup route returns `notFound()`. The unused shared Supabase `signUp` helper was removed. All six remaining administrative magic-link sends now set `shouldCreateUser: false`, preventing them from creating a user. The former page allowed a visitor to submit `admin`, `expert`, or `company_owner` role metadata.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control and 164.312(d) Person or Entity Authentication.
- **Files changed:** `src/app/pages/auth/signup/page.tsx`, `src/lib/auth.ts`, `src/lib/supabase/middleware.ts`, `src/app/actions/users.ts`, `docs/migrations/step-1-migration-control.md`, `docs/hipaa/compliance-log.md`.
- **Gap and remediation:** A browser can call Supabase Auth directly with the public key until the project-level **Allow new users to sign up** setting is disabled. The project owner must disable that setting and **Allow anonymous sign-ins** in Supabase Dashboard, then verify existing administrator login and admin-created magic links. Step 6 must replace the remaining Supabase administrative and magic-link mechanisms with invite-only Auth.js provisioning, durable rate limits, MFA enrollment, revocable database sessions, and authentication audit events.

### Internal Note Search Audit (pre-existing, date unknown)
- **What:** Every search of `internal_notes` ≥ 3 characters triggers a debounced audit log entry.
- **Files:** `src/app/actions/internal-notes.ts` → `logNoteSearchAction`
- **Audit row:** `action='SEARCH'`, `table_name='internal_notes'`, `details: { search_term, results_returned, subject_type, subject_id }`
- **Why it matters:** Allows auditors to reconstruct who searched for what PHI and what was returned (HIPAA investigation traceability).

### People Tab — Permission Change Audit (2026-08-19)
- **What:** Every permission-change and access-grant operation in the Unified Agency People Table writes an `audit_log` row.
- **Covered operations:**
  - Add key staff / officer → `action: 'CREATE_KEY_STAFF'`
  - Add member/owner → `action: 'CREATE_MEMBER_OWNER'`
  - Update key staff info → `action: 'UPDATE_KEY_STAFF'`
  - Grant system access (promote to credentialed user) → `action: 'GRANT_SYSTEM_ACCESS'`
  - Status toggle active/inactive (agency admin) → `action: 'UPDATE_STATUS'`
  - Status toggle active/inactive (care coordinator) → `action: 'UPDATE_STATUS'`
- **Pre-existing gaps fixed:** `updateAgencyAdminStatus` and `updateCareCoordinatorStatus` in `agency-users.ts` were missing audit logging — corrected as part of this feature.
- **Files changed:** `src/app/actions/agency-users.ts`, `src/app/actions/agency-onboarding.ts`
- **Audit row shape:** `{ agency_id, table_name, record_id, action, performed_by_user_id, details: { old_status?, new_status?, credential?, officer_role?, full_legal_name?, changed_fields? } }`

### Login Audit Trail — `last_login_at` (2026-08-19)
- **What:** `user_profiles.last_login_at` (timestamptz, nullable) added to the schema. Updated to the current timestamp on every successful `signIn()` call.
- **Files changed:** `supabase/migrations/phase_two/162_user_agency_roles_phase_a.sql` (ADD COLUMN), `src/lib/auth.ts` (update on sign-in)
- **Audit row:** Column on `user_profiles` — no separate log row needed; the value is an authoritative, server-written timestamp that cannot be set by the user.
- **Why it matters:** Provides an auditable record of when each user last authenticated, enabling investigation of unauthorized access and session anomalies.

### Patient Lead Details PHI Audit — `patient_lead_details` (2026-08-26)
- **What:** `updatePatientLeadDetailsAction` in `src/app/actions/leads.ts` now writes an `audit_log` row on every upsert of patient lead detail records. This table stores ePHI: `reason_for_care`, `medical_conditions`, `mobility_status`, `cognitive_status`, `insurance_carrier`, and `insurance_policy_number`.
- **Audit row:** `action='UPSERT'`, `table_name='patient_lead_details'`, `record_id=<row id>`, `details: { lead_id, agency_id }`
- **Files changed:** `src/app/actions/leads.ts`, `supabase/migrations/phase_two/166_patient_lead_details.sql`
- **Why it matters:** All mutations to ePHI must be auditable so investigators can reconstruct who changed what and when.

### Agency Notes and Documents Audit (2026-08-27)
- **What:** Four functions in `src/app/actions/agencies.ts` that were missing audit log entries now write `audit_log` rows on every mutation.
- **Covered operations:**
  - `addAgencyNote` → `action: 'CREATE'`, `table_name: 'agency_notes'`
  - `deleteAgencyNote` → `action: 'DELETE'`, `table_name: 'agency_notes'`
  - `uploadAgencyDocument` → `action: 'CREATE'`, `table_name: 'agency_documents'`, `details: { document_name, document_type, file_name }`
  - `deleteAgencyDocumentAction` → `action: 'DELETE'`, `table_name: 'agency_documents'`, `details: { file_path }`
- **Files changed:** `src/app/actions/agencies.ts`

### Playbook Item Mutations Audit (2026-08-27)
- **What:** Three core playbook item mutations and one program item mutation previously had zero audit coverage. All now write `audit_log` rows.
- **Covered operations:**
  - `addPlaybookItem` → `action: 'CREATE'`, `table_name: 'playbook_items'`, `details: { playbook_id, item_type, name }`
  - `updatePlaybookItem` → `action: 'UPDATE'`, `table_name: 'playbook_items'`, `details: { fields_updated }`
  - `deletePlaybookItem` → `action: 'DELETE'`, `table_name: 'playbook_items'`
  - `addProgramItem` → `action: 'CREATE'`, `table_name: 'application_playbook_items'`, `details: { application_id, item_type, name }` (agency_id resolved from applications table)
- **Files changed:** `src/app/actions/playbooks.ts`

### Caregiver Availability — Server Action Migration (2026-08-27)
- **What:** `CaregiverMyCalendarContent.tsx` was calling `supabase.from('caregiver_availability_slots')` INSERT/UPDATE/DELETE directly from the browser client component. These mutations had no audit trail and no RLS enforcement on the mutation path. Moved all three mutations to a new server action file with authentication, authorization, audit logging, and cache revalidation.
- **Files changed:** `src/components/CaregiverMyCalendarContent.tsx` (removed direct mutations), `src/app/actions/caregiver-availability.ts` (new), `src/lib/supabase/query/caregiver-availability.ts` (added mutation query functions)
- **Audit row:** `action: 'CREATE'/'UPDATE'/'DELETE'`, `table_name: 'caregiver_availability_slots'`, `agency_id` resolved from `caregiver_members`, `details: { is_recurring, specific_date }`
- **Authorization gate:** Server action verifies `caregiver_members.user_id = session.user.id` — caregivers can only manage their own availability slots.

### Application Progress — Server Action Migration (2026-08-27)
- **What:** `ExpertProgramView.tsx` was calling `supabase.from('applications').update({ progress_percentage })` directly from a browser `useEffect` with no audit trail. Moved to `updateApplicationProgressAction` in `src/app/actions/applications.ts`.
- **Files changed:** `src/components/ExpertProgramView.tsx`, `src/app/actions/applications.ts`
- **Audit row:** `action: 'UPDATE'`, `table_name: 'applications'`, `details: { field: 'progress_percentage', value }`, `agency_id` resolved from applications table.

### Document Storage — Server Action Migration (2026-08-27)
- **What:** Five client components were calling `supabase.storage.*` directly from the browser. These mutations had no audit trail, bypassed the `src/lib/storage/` wrapper, and were exposed to browser-level network interception. Moved all upload and delete operations to three new server action files. Also updated four existing server actions (`agencies.ts`, `leads.ts`, `licenses.ts`, `playbooks.ts`) to route storage calls through the wrapper rather than calling the SDK directly.
- **Covered client violations fixed:**
  - `UploadDocumentModal.tsx` + `UploadDocumentButton.tsx` → `uploadApplicationDocumentsAction` in `application-documents.ts`
  - `ApplicationDetailContent.tsx` `handleReplaceAdHocDocument` → `replaceApplicationDocumentAction` in `application-documents.ts`
  - `ClientDetailContent.tsx` `handleDocumentFileChange` / `handleDeleteDocument` → `uploadPatientDocumentsAction` / `deletePatientDocumentAction` in `patient-documents.ts`
  - `CaregiverDocumentsPanel.tsx` `handleFileChange` / `handleDelete` → `uploadCaregiverDocumentsAction` / `deleteCaregiverDocumentAction` in `caregiver-documents.ts`; also removed direct `q.updateStaffMemberDocuments()` client-side DB call
- **Files changed (new):** `src/app/actions/application-documents.ts`, `src/app/actions/patient-documents.ts`, `src/app/actions/caregiver-documents.ts`, `src/lib/storage/client.ts` (added `removeFiles`, `getSignedUrl`)
- **Files changed (modified):** `src/components/UploadDocumentModal.tsx`, `src/components/UploadDocumentButton.tsx`, `src/components/ApplicationDetailContent.tsx`, `src/components/ClientDetailContent.tsx`, `src/components/CaregiverDocumentsPanel.tsx`, `src/app/actions/agencies.ts`, `src/app/actions/leads.ts`, `src/app/actions/licenses.ts`, `src/app/actions/playbooks.ts`
- **Audit rows:** Each upload/delete server action writes an `audit_log` row with `action: 'CREATE'/'UPDATE'`, `table_name: 'application_documents'/'patients'/'caregiver_members'`, `agency_id` resolved per domain.
- **Why it matters:** Storage mutations on ePHI-related documents (patient records, caregiver records, application documents) were previously unauditable because they bypassed the server entirely. Any browser session could construct a storage request without it appearing in the audit trail.

---

## § 164.312(d) — Person/Entity Authentication

### Auth.js v5 Migration — Password-Based Authentication (2026-09-09)
- **What:** Replaced Supabase Auth (closed password storage in `auth.users`, inaccessible) with Auth.js v5 Credentials provider. Passwords are now stored as bcrypt hashes (cost factor 12) in `user_profiles.password_hash` under the application's direct control. `password_hash` is never selected in any query returned to the client.
- **Existing user impact:** Supabase passwords were not exportable. All existing users are required to reset their password on first login after cutover. A pre-cutover notification email is sent via Mailgun. Users with `password_hash IS NULL` are rejected at login with a prompt to reset.
- **Invited user flow:** Admin-created users receive a temporary bcrypt-hashed password via Mailgun invitation email. They must change it on first login.
- **Token expiry:** JWT sessions expire after 1 hour (`maxAge: 60 * 60`). `is_active` is fetched fresh from DB on every request — disabling a user takes effect on the next server request regardless of JWT age.
- **Relevant safeguard:** 45 CFR § 164.312(d) Person/Entity Authentication.
- **Files changed:** `src/auth.ts` (new), `src/lib/auth.ts` (internals replaced), `src/app/actions/users.ts`, `src/app/actions/agency-users.ts`, `src/lib/email.ts`

---

## § 164.312(e)(1) — Transmission Security

### Auth.js v5 Migration — Session Cookie Security (2026-09-09)
- **What:** Auth.js v5 issues JWT sessions in HTTP-only, Secure, SameSite=Strict signed cookies using `AUTH_SECRET`. Supabase Auth cookies are removed. The new cookies are not accessible to JavaScript (XSS protection) and are not sent cross-origin (CSRF protection). All server actions using `createAdminClient()` are now protected by explicit `getSession()` calls rather than relying on implicit Supabase Auth cookie context.
- **Relevant safeguard:** 45 CFR § 164.312(e)(1) Transmission Security — prevents session token interception via XSS and CSRF.
- **Files changed:** `src/auth.ts`, `src/middleware.ts`, all `src/app/actions/*.ts` (switched to `createAdminClient()` + explicit `getSession()`)

---

## § 164.312(a)(1) — Access Control

### Permission Centralization — `requirePlatformStaffOrAgencyRole` (2026-08-19)
- **What:** Replaced three separate copy-pasted inline permission helpers in `agency-users.ts`, `agency-onboarding.ts`, and `agency-people.ts` with a single authoritative function in `src/lib/permissions.ts`. All agency-scoped server actions now go through one audit point.
- **Files changed:** `src/lib/permissions.ts` (new), `src/app/actions/agency-users.ts`, `src/app/actions/agency-onboarding.ts`, `src/app/actions/agency-people.ts`
- **Why it matters:** A single permission function means access-control logic can be audited, tested, and corrected in one place rather than across N files that may drift out of sync.

### Account Lockout — `is_active` (2026-08-19)
- **What:** `user_profiles.is_active` (boolean NOT NULL DEFAULT true) added to schema. When set to `false`: (1) `requirePlatformStaffOrAgencyRole` returns Forbidden before any DB query executes, (2) `is_platform_staff()` RLS function denies all table access, (3) `has_agency_role()` RLS function denies all agency-scoped access. Deactivation takes effect immediately with no login session invalidation needed.
- **Files changed:** `supabase/migrations/phase_two/162_user_agency_roles_phase_a.sql` (ADD COLUMN, update `has_agency_role()`), `supabase/migrations/phase_two/163_rls_functions_phase_b.sql` (update `is_platform_staff()`), `src/lib/permissions.ts` (application-layer check)
- **Gap fixed:** Prior to this, deactivating a user required updating status in each of `agency_admins`, `care_coordinators`, and `caregiver_members` separately — none of which blocked login or prevented API access.
- **Why it matters:** Satisfies the requirement to revoke ePHI access immediately when a workforce member's authorization changes or employment ends.

### Patient Lead Details — Intentional Platform Staff Exclusion (2026-08-26)
- **What:** The `patient_lead_details` table (ePHI) grants RLS access to agency members only via `is_agency_member()`. Platform staff (admin/expert roles) are intentionally excluded from all RLS policies on this table.
- **Rationale:** Platform staff are licensing consultants with no clinical or care-coordination role. Granting them standing access to patient ePHI would violate the HIPAA Minimum Necessary Standard (§ 164.514(d)). Any legitimate break-glass access by a platform admin must go through a one-time manual operation with an explicit audit log entry.
- **Files changed:** `supabase/migrations/phase_two/166_patient_lead_details.sql`
- **Note:** Insurance policy numbers are stored as plain text. No UI masking applied — intentional design decision for internal agency use only.

### Storage Boundary — Server-Side Auth Enforcement for Document Operations (2026-08-27)
- **What:** All document upload and delete operations for patient records (`patient-documents` bucket), caregiver records (`staff-member-documents` bucket), and application documents (`application-documents` bucket) now require server-side authentication before any storage SDK call is made. Browser clients can no longer reach the storage buckets without a valid server-authenticated session.
- **Mechanism:** Three new server action files enforce `supabase.auth.getUser()` on every mutation. The `src/lib/storage/client.ts` wrapper is the sole point of contact with the Supabase Storage SDK — all upload, remove, and signed URL generation goes through it.
- **Platform migration note:** When Azure Blob Storage replaces Supabase Storage, only `src/lib/storage/client.ts` changes; no components or server actions need modification.
- **Files changed:** `src/app/actions/application-documents.ts`, `src/app/actions/patient-documents.ts`, `src/app/actions/caregiver-documents.ts`, `src/lib/storage/client.ts`

### Agency People Self-Management (2026-08-19)
- **What:** `requireAdminOrAgencyOwner(agencyId)` helper added to `agency-users.ts` and `agency-onboarding.ts`. All people-management server actions now enforce that callers are either platform staff (admin/expert) or the `company_owner` of that specific agency. Cross-agency access returns Forbidden.
- **Files changed:** `src/app/actions/agency-users.ts`, `src/app/actions/agency-onboarding.ts`
- **RLS policies added:** `agency_key_staff_agency_admin_select`, `agency_key_staff_agency_admin_insert`, `agency_key_staff_agency_admin_update`, `care_coordinators_agency_admin_select`, `care_coordinators_agency_admin_update` — all scoped via `hs_is_agency_admin(agency_id)`.
- **Why it matters:** Ensures agency owners can self-manage their own team without platform-admin involvement while preventing any cross-agency data access.

### Admin Account — Cascade Deactivation Independence (2026-09-08)
- **What:** Agency deactivation cascade (`setAgencyStatus` in `src/app/actions/agencies.ts`) only touches accounts with roles `['company_owner', 'care_coordinator', 'staff_member']`. Admin accounts are never deactivated by an agency cascade, even if that admin is associated with the agency. Manual disable from User Management remains available for admin accounts when explicitly needed.
- **Relevant safeguard:** 45 CFR § 164.312(a)(2)(ii) Emergency Access Procedure — ensures platform administrators retain access for emergency and break-glass operations even when an agency is deactivated.
- **Files changed:** `src/app/actions/agencies.ts` (cascade role filter — confirmed correct), `src/app/actions/users.ts` (removed erroneous admin disable guard), `src/components/UserManagementTabs.tsx`

### People Tab — Key Staff Active Status Source of Truth (2026-09-08)
- **What:** Fixed a bug where key staff members linked to a user account were still displayed as Active in the Agency People tab after the agency was deactivated. Root cause: `buildPeopleRows` was reading `agency_key_staff.status` (never updated by the cascade) instead of `user_profiles.is_active` (the single source of truth). The fix fetches `is_active` for all linked user accounts in one bulk query and maps it onto key staff records.
- **Relevant safeguard:** 45 CFR § 164.312(a)(1) Access Control — ensures ePHI access state is accurately represented in the UI, allowing admins to trust what they see without a false sense of active access.
- **Files changed:** `src/app/actions/agency-people.ts`, `src/components/AgencyPeopleTab.tsx`

### Auth.js v5 Migration — `is_active` Real-Time Enforcement (2026-09-09)
- **What:** `user_profiles.is_active` is fetched fresh from the DB on every server request inside `getSession()` (wrapped with `React.cache()` so only one DB query fires per request). It is never embedded in the JWT. An admin disabling a user takes effect on the user's next server request — there is no stale-JWT window where a deactivated account retains ePHI access.
- **Relevant safeguard:** 45 CFR § 164.312(a)(1) Access Control — ensures revocation of ePHI access is immediate and cannot be bypassed by a cached token.
- **Files changed:** `src/lib/auth.ts` (internals replaced — exported API unchanged)

### Edit User Modal — Admin User Profile Editing (2026-09-10)
- **What:** Admin can edit any user's full name, email address, and role from the User Management page via the "Edit User" modal. The `updateUserProfileAction` server action in `src/app/actions/users.ts` replaces the narrower `changeUserRoleAction`.
- **Auth enforcement:** `getSession()` + admin role check on every call. Self-role-change returns an error server-side; self name/email edit is permitted.
- **Audit trail:** All changed fields are recorded in a single `audit_log` insert with `details.changes` as an array of `{ field, old, new }` objects. `details.affected_user_email` records the user's pre-change email so the log remains interpretable after an email change.
- **Email change security:** When admin changes a user's email, `invite_token` and `invite_token_expires_at` are cleared in the same DB update. A password reset link addressed to the old email cannot be redeemed after the change.
- **Email uniqueness:** Checked server-side before update. Duplicate email returns a user-facing error rather than a Postgres constraint violation.
- **Role-table consistency:** Name and email changes are propagated to the role-specific table (`agency_admins.contact_name/contact_email`, `care_coordinators.first_name/last_name/email`, `caregiver_members.first_name/last_name/email`, `licensing_experts.first_name/last_name/email`) so the Agency People tab and Caregivers tab never show stale identity data. This also closes a pre-existing gap where `updatePersonalProfile` (self-edit) did not sync expert names.
- **Role change — row creation:** When role changes to `company_owner`, `staff_member`, or `expert`, `ensureRoleTableRow` is called to idempotently create the new role's table row. `care_coordinator` is excluded (requires `agency_id` not available in admin edit context); `admin` has no role-specific table.
- **Relevant safeguards:** 45 CFR § 164.312(d) Person/Entity Authentication — email address is the password reset delivery address; an unaudited change could silently redirect account access to a different inbox. 45 CFR § 164.312(a)(1) Access Control — role changes directly determine what ePHI the user can reach.
- **Files changed:** `src/app/actions/users.ts` (`updateUserProfileAction` replaces `changeUserRoleAction`), `src/components/UserManagementTabs.tsx` (`EditUserModal` replaces `ChangeRoleModal`)

### Neon RLS + Query Bridge — Agency Data Isolation Infrastructure (Phase 4, 2026-09-12)
- **What:** Replaced Supabase RLS (`auth.uid()`) infrastructure with standard PostgreSQL RLS using `current_setting('app.current_user_id')`, `current_setting('app.current_user_role')`, and `current_setting('app.current_agency_id')` session variables set via `SET LOCAL` inside transactions. All client component DB calls now route through `src/app/actions/query-bridge.ts`, which verifies the Auth.js session and calls `withUserContext` before any query executes. Unauthenticated calls return `{ error: 'Unauthorized', data: null }` without touching the DB.
- **Query bridge architecture:** `src/app/actions/query-bridge.ts` exports ~122 explicit async wrappers (one per query function). Each wrapper calls a shared `ctx()` helper that: (1) verifies the Auth.js session via `getSession()`, (2) returns `{ data: null, error: 'Unauthorized' }` without touching the DB if no session, (3) opens a postgres.js transaction via `withUserContext`, (4) catches infrastructure failures that query functions' own try/catch cannot see. Client components import from the bridge; server-only `postgres.js` code never crosses the client/server boundary.
- **`withUserContext` mechanism:** `src/db/index.ts` adds an `AsyncLocalStorage` store and an apply-only Proxy over the postgres.js `sql` client. The Proxy intercepts tagged-template calls (`sql\`...\``) and routes them through the active transaction `tx` when inside `withUserContext`. All ~122 query functions route through `tx` automatically — zero changes to the query functions themselves. The apply-only Proxy (no `get` trap) ensures `sql.begin`, `sql.unsafe`, and all other methods fall through to the real client, preventing accidental transaction nesting.
- **Connection-pool safety:** `SET LOCAL` (not `SET`) scopes session variables to the current transaction. They are automatically cleared on commit, preventing context bleed across pooled connections. This is the HIPAA-correct choice; session-scoped `SET` would be a security bug in a pooled environment.
- **`FORCE ROW LEVEL SECURITY` requirement (Phase 4.5):** When RLS policies are applied table by table, each table requires `ALTER TABLE <t> FORCE ROW LEVEL SECURITY` so ordinary table-owner bypass is subject to the policies. `FORCE` does not apply to roles granted `BYPASSRLS`; the application runtime connection must use a dedicated non-`BYPASSRLS` role.
- **RLS application deferred (Phase 4.5):** Enabling RLS on any table requires that ALL server actions touching that table also call `withUserContext`. The bridge covers client-component paths; `src/app/actions/*.ts` server actions are audited table by table before RLS is enabled for each table. Applying RLS before this audit is complete would silently return 0 rows from server-rendered pages.
- **Relevant safeguards:** 45 CFR § 164.312(a)(1) Access Control — DB-level enforcement of agency data isolation, independent of application-layer checks. An `agency_owner` cannot read another agency's ePHI even by constructing a direct query call. 45 CFR § 164.312(e)(1) Transmission Security — session variables are transaction-scoped and never leak to other pooled connections.
- **Files changed:** `src/db/index.ts` (AsyncLocalStorage + apply-only Proxy + `withUserContext` export), `src/app/actions/query-bridge.ts` (~122 explicit async wrappers replace `export *` re-exports), `src/app/actions/messages.ts` (added `withUserContext` to all 23 wrappers via `ctx` helper)

### Query Bridge Hardening + Browser Supabase Removal Follow-up (2026-09-16)
- **What:** Hardened the Phase 4/4.5 query bridge follow-up before enabling `patients` RLS. `src/db/index.ts` now routes `sql.unsafe(...)` through the active `withUserContext` transaction when one exists, so direct unsafe query execution does not escape the `SET LOCAL` RLS context. `src/app/actions/query-bridge.ts` now role-gates patient, representative, schedule, ADL, incident, service-contract, and skilled-care mutation wrappers to agency-management/platform roles.
- **Browser Supabase paths remediated:** `src/components/CaregiverProfileContent.tsx` no longer reads `caregiver_pay_rates` or `scheduled_visits` through the browser Supabase client. The reads now go through `src/app/actions/caregiver-profile.ts`, which authenticates the user, verifies caregiver/agency ownership, and runs the queries inside `withUserContext`.
- **Internal notes remediation:** `src/components/InternalNotesPanel.tsx` no longer reads `internal_notes` or `caregiver_members` through the browser Supabase client. Reads now go through `getInternalNotesPanelDataAction`, which verifies role, agency, subject ownership, and tag ownership before returning notes and tag options. Add/edit/delete/search note actions now validate agency/subject access before mutation or audit insertion.
- **Audit PHI minimization:** Internal note audit entries no longer persist note content or search terms. Audit details retain non-content trace metadata such as subject type/id, content length, tag-change booleans, and result counts. The legacy exported `updatePatientDocumentsAction` was disabled because document mutations must go through the upload/delete actions that authorize before storage access; patient skill-requirement audit details now log only the changed field and skill count, not the actual skill codes.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity.
- **Files changed:** `src/db/index.ts`, `src/app/actions/query-bridge.ts`, `src/app/actions/caregiver-profile.ts`, `src/components/CaregiverProfileContent.tsx`, `src/app/actions/internal-notes.ts`, `src/components/InternalNotesPanel.tsx`, `src/app/actions/patients.ts`, `docs/hipaa/compliance-log.md`.
- **Remaining gap:** The production/runtime Neon connection must not use a role with `BYPASSRLS` before RLS is treated as an effective control. Full Supabase removal remains a larger migration phase; this entry covers the RLS-blocking PHI paths reviewed for the `patients` rollout.

### Neon Runtime Role Gate for patients RLS (2026-09-16)
- **What:** Added `scripts/neon-runtime-role-setup.sql` to create and grant the dedicated `mycaresight_app` Neon runtime role with `rolbypassrls=false`. Updated `scripts/rls-patients-enable.sql` to fail closed unless that runtime role exists, can log in, and cannot bypass RLS.
- **Policy hardening:** `patients_agency_rls` is now scoped `TO mycaresight_app`; only `admin`/`expert` or the known agency-scoped roles (`company_owner`, `care_coordinator`, `staff_member`) can match the policy. The verification steps explicitly test no-context denial, unexpected-role denial, same-agency visibility, cross-agency denial, and platform-role visibility under `SET LOCAL ROLE mycaresight_app`.
- **Correction:** The previous script comments over-relied on `FORCE ROW LEVEL SECURITY`; `FORCE` does not protect against a role that has `BYPASSRLS`. The app runtime connection string must use `mycaresight_app`, not `neondb_owner`.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control and 164.312(c)(1) Integrity.
- **Files changed:** `scripts/neon-runtime-role-setup.sql`, `scripts/rls-patients-enable.sql`, `scripts/rls-patients-disable.sql`, `docs/hipaa/compliance-log.md`.
- **Remaining gap:** The scripts are prepared but not applied to Neon in this repository change. After applying, update the deployed app `DATABASE_URL` to the `mycaresight_app` connection string and run the verification queries from the enable script.
