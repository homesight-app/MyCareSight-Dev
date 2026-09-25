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

### Auth Email Provider Initialization Hardening (2026-09-16)
- **What:** Moved Mailgun client creation from module import time to email send time. Missing Mailgun configuration now fails the specific send operation with a clear error instead of preventing the Next.js application from building or loading routes that import the email helper.
- **Relevant safeguards:** 45 CFR 164.312(d) Person or Entity Authentication, because password reset and invitation email flows depend on the email helper.
- **Files changed:** `src/lib/email.ts`, `docs/hipaa/compliance-log.md`.
- **Remaining gap:** UAT and production still require valid Mailgun settings before password reset, invitation, notification, or contact-confirmation emails can be delivered.

### UAT Supabase Removal Preparation and Deployment Isolation (2026-09-20)
- **What:** Recorded the user-approved UAT-only Azure/Neon/Blob scope and separate production repository. Removed 40 unused Supabase client constructions and 42 imports from 40 page files that already obtain their data elsewhere. Existing page queries and authorization checks are preserved; active Supabase readers retain their clients.
- **Deployment boundary:** Added repository guards to the UAT build/deploy jobs and an Azure subscription check before deployment, restricted to MyCareSight-Dev-UAT (a268ab63-b7ec-490d-a858-0de0be69ed4f). These are local changes; no deployment or cloud configuration change was performed.
- **Relevant safeguards:** Supports the existing 45 CFR 164.312(a)(1) Access Control and 164.312(c)(1) Integrity controls through controlled environment separation. This entry does not assert HIPAA readiness.
- **Files changed:** AGENTS.md, .github/workflows/main_mycaresight-uat.yml, docs/migrations/step-1-migration-control.md, docs/migrations/uat-supabase-removal.md, docs/hipaa/compliance-log.md, and the 40 page files enumerated in the UAT migration document.
- **Verification:** Baseline/post-change typechecks and focused page lint passed; local deployment-guard tests reject wrong/empty subscriptions and CLI failure. Standard npm run lint has a pre-existing ESLint 9 configuration failure. Build and live-test status are recorded in the UAT migration document.
- **Remaining gaps and remediation:** Live Supabase/Neon metadata verification is unavailable pending connections; live Azure resource verification failed TLS certificate verification. Database-specific replacements, unread-count function fixes, record-authorized storage signing, session/recovery migration, and cross-agency tests remain pending. Keep Supabase settings and dependencies until full UAT verification passes; production resources and shared credentials remain untouched.

### Live Supabase and Neon UAT Schema Verification (2026-09-20)
- **What:** Used the read-only Supabase MCP source and explicitly selected Neon dev/uat branch IDs to compare catalog metadata. Verified project steep-sky-59385366, dev br-bitter-dust-axfgiziy, and uat br-empty-mouse-axnk8fbc. No application records were queried or copied; no remote writes, deployments, or credential changes occurred.
- **Evidence:** The inspected dev/uat schemas match, but seven application tables are absent. Neither branch has application functions or non-internal triggers. Source check/unique constraints and many foreign-key/delete behaviors are missing or differ. The missing unread-count functions are confirmed.
- **Access controls:** mycaresight_app exists with LOGIN and without SUPERUSER/BYPASSRLS on both branches; neondb_owner has BYPASSRLS. Only patients has RLS enabled/forced. Runtime DATABASE_URL identity and active-membership/cross-agency behavior remain unverified.
- **Relevant safeguards:** Findings concern 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity. This inspection does not establish compliance or HIPAA readiness.
- **Files changed:** docs/migrations/uat-live-schema-baseline.md, scripts/migrations/000-schema-preflight.sql, docs/migrations/uat-supabase-removal.md, docs/hipaa/compliance-log.md.
- **Remediation:** Prepare reviewed, versioned repair migrations for manual execution on dev before uat; reconcile trigger/RPC behavior, tenant authorization, and integrity constraints before final Supabase removal. The new preflight script is metadata-only and does not repair or mutate a database.

### Neon Message Read-State Repository (2026-09-20)
- **What:** Replaced six missing message RPC dependencies and the invalid boolean read-state update with a server-only Neon repository, preserving existing export names. Total unread count now returns a scalar; read receipts remain per-user UUID arrays.
- **Authorization:** Every migrated operation validates the authenticated reader and a current active Neon profile. Agency conversation access requires active membership; platform admin/expert scope matches inspected source policies. Caller-supplied IDs only narrow the authorized set. Other legacy message/notification operations remain outside this completed slice.
- **Audit/integrity:** Read and update audit records contain actor/resource identifiers without message content. Audit and mutations share a transaction; audit failure rolls back changes. Generic errors prevent leaking database parameters. The unsafe source timestamp heuristic for clearing notifications was not copied because source notifications lack an exact message reference.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person/Entity Authentication.
- **Files changed:** src/lib/repositories/message-read-state.ts, src/lib/schemas/message-read-state.ts, src/lib/supabase/query/messages.ts, src/app/actions/messages.ts, src/app/actions/query-bridge.ts, src/_tests_/message-read-state.test.ts, jest.config.ts, package.json, package-lock.json, scripts/migrations/001-message-read-state-indexes.sql, docs/migrations/uat-message-read-state.md, docs/migrations/uat-supabase-removal.md, docs/hipaa/compliance-log.md.
- **Verification:** 15 synthetic local PostgreSQL integration tests passed; the full pre-index-test suite of 51 tests, TypeScript, focused lint, and configured build passed. Standard npm run lint retains its pre-existing ESLint configuration failure. No live records were read or changed, and the optional index migration was not applied.
- **Remaining gaps:** Supabase-backed session/profile helpers, other message/notification authorization paths, Realtime, missing tables/constraints/triggers, and live two-account acceptance remain pending. This change does not establish HIPAA readiness or full Supabase independence.

### Message Index Migration Application Verification (2026-09-20)
- **What:** The user reported applying 001-message-read-state-indexes.sql to Neon dev and uat. Read-only MCP checks independently confirmed all three indexes are valid, ready, and match the expected definitions on each branch.
- **Scope:** Catalog metadata only; the agent performed no remote writes or application-record queries. Production was not queried or changed. Application code remains local and live workflow acceptance is pending.
- **Relevant safeguard:** Supports the controlled migration evidence for 45 CFR 164.312(c)(1) Integrity; no authorization policy or PHI content was changed by the index script.
- **Files changed:** docs/migrations/uat-supabase-removal.md, docs/migrations/uat-message-read-state.md, docs/hipaa/compliance-log.md.

### Missing Application Table Staging Scripts (2026-09-21)
- **What:** Prepared manual Neon migrations for seven missing application tables using live Supabase column/constraint/index/trigger metadata and independently verified Dev/UAT parent keys, runtime-role flags, and default grants. Added a metadata verification script and optional four-row synthetic credential seed; no production records were copied.
- **Access controls:** New tables enable/force RLS with no permissive policies, and revoke PUBLIC/mycaresight_app privileges that would otherwise be inherited from default grants. The migration requires an independent migration owner and a non-superuser, non-BYPASSRLS runtime role. Runtime workflow grants remain deferred until reviewed caller/context/policy changes are ready. Local DATABASE_URL is configured with the mycaresight_app username; Azure identity remains unverified.
- **Integrity:** Preserved inspected structures with three explicit foreign-key corrections: required note authors use RESTRICT rather than SET NULL, and adjustment-history agency/time-entry parents use RESTRICT rather than CASCADE. Portable timestamp triggers use a SECURITY INVOKER helper with a fixed search path. Existing application tables/data are not rewritten.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity. This staging step does not establish HIPAA readiness or full tenant-policy coverage.
- **Files changed:** scripts/migrations/002-stage-missing-application-tables.sql, scripts/migrations/002-verify-missing-application-tables.sql, scripts/migrations/003-seed-synthetic-credentials.sql, src/_tests_/missing-application-tables.test.ts, docs/migrations/uat-missing-application-tables.md, docs/migrations/uat-supabase-removal.md, docs/hipaa/compliance-log.md.
- **Verification:** All 65 local tests, TypeScript, focused lint, and whitespace checks passed. Thirteen new tests cover access denial, inherited grants, schema integrity, retention, preconditions, rollback, timestamp behavior, and synthetic-seed conflicts. Standard lint remains a known configuration gap; build was not repeated for this SQL/test/documentation-only batch.
- **Remaining gaps:** Scripts are prepared but not applied by the agent. The user must execute and verify on Dev before UAT. Existing callers still require business-function replacement, transaction-local context, active membership/record authorization, audit hardening, and final RLS policies before these workflows can use the staged tables. Production remains unchanged.

### Dev/UAT Table Staging and RLS Readiness Verification (2026-09-21)
- **What:** Following user execution of 002 and 003, read-only checks on explicitly selected Neon Dev/UAT branches returned seven passing staging rows and four matching reserved synthetic credential fixtures on each branch. The agent made no remote writes and did not query production.
- **Access state:** All seven new tables enable/force RLS, have no policies, and have no mycaresight_app table privileges. The runtime role is LOGIN without SUPERUSER/BYPASSRLS. Patients remains the sole table with an access policy; its policy uses role/agency context without independently verifying active membership or caregiver assignment.
- **Relevant safeguards:** Evidence concerns 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity. No claim of HIPAA readiness or complete authorization coverage is made.
- **Files changed:** docs/migrations/uat-rls-readiness.md, docs/migrations/uat-missing-application-tables.md, docs/migrations/uat-supabase-removal.md, docs/hipaa/compliance-log.md.
- **Remaining gaps and remediation:** Pair command-specific policies/grants with caller fixes in credential, pay-rate, note, and visit/financial workflows. Cover cached entry points, active memberships, transaction context, linked-record ownership, and transactional audits. Audit and tighten patients separately; 66 other public tables currently lack RLS. Azure runtime identity and live negative-access tests remain pending. No new access migration is ready to apply from this inspection.
- **Validation:** Executed the existing staging verification SELECT against both branches and checked synthetic fixture equality, runtime role flags, table counts, and live policy definitions. Documentation-only changes require no application test/build rerun.

### Credential Reference Read Boundary and RLS Migration (2026-09-21)
- **What:** Prepared migration 004 granting only credential_catalog SELECT to the restricted runtime role, with a policy requiring a current active Neon user and active matching membership for agency roles. Global reference labels are shared; no caregiver/patient records or content are read. The source authenticated-read policy and live source/Dev/UAT columns were inspected through read-only MCP.
- **Authorization:** Added a server-only repository using transaction-local actor context; session role/agency values do not grant access. Legacy exports route to this boundary. Removed the credential unstable_cache wrapper so all entry points recheck current authorization; no caller accepts client-provided actor IDs. The other six staged tables remain closed.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control and 164.312(c)(1) Integrity. No PHI audit event is introduced for this reference-only read, and this change does not establish HIPAA readiness.
- **Files changed:** src/lib/repositories/credential-catalog.ts, src/lib/supabase/query/task-required-credentials.ts, src/app/actions/query-bridge.ts, src/lib/server-cache/reference-lists.ts, src/_tests_/credential-catalog.test.ts, scripts/migrations/004-credential-catalog-read-access.sql, scripts/migrations/004-verify-credential-catalog-read-access.sql, docs/migrations/uat-credential-catalog.md, docs/migrations/uat-rls-readiness.md, docs/migrations/uat-supabase-removal.md, docs/hipaa/compliance-log.md.
- **Validation:** All 80 tests, TypeScript, and focused lint passed. Tests execute the real SELECT policy as the restricted runtime role, including denied writes, inactive membership, stale role context, and context cleanup. Standard lint retains the existing ESLint 9 configuration failure. The production build passed with synthetic service settings and existing Edge-runtime/React-hook warnings; its artifact is not deployable. Whitespace checks passed.
- **Remaining gaps:** 004 awaits manual Dev-first application and verification. Full reference catalog reconciliation, other workflow policies, live account acceptance, and Azure runtime identity checks remain pending. Supabase-backed getSession remains transitional. No remote writes, push, deployment, or production record access occurred.

### Credential Policy Verification and Pay-Rate Read Boundary (2026-09-21)
- **Live evidence:** Read-only checks confirm 004 in Dev/UAT: credential RLS enabled/forced, the expected active-reference SELECT policy for mycaresight_app, SELECT granted, and no runtime write privileges. Pay-rate staging remains closed in both branches. No remote writes or production record access occurred.
- **What:** Prepared migration 005 for scoped caregiver_pay_rates SELECT and moved all known pay-rate readers into an application-owned server-only Neon repository, including three Supabase page reads. Active matching memberships are required for agency roles; staff are limited to their own active caregiver record; every rate must match its caregiver's agency. Existing platform profile-read scope is retained.
- **Audit/integrity:** Read audits contain only actor/resource identifiers and commit with reads. Audit failures return no rates. Shared withActorContext verifies an existing transaction actor before reuse, preserving context and avoiding nested pool acquisition. Financial callers propagate access failure rather than calculating from partial/unauthorized selections.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity. This is not evidence of full HIPAA readiness or complete report/approval authorization.
- **Files changed:** src/db/index.ts; src/lib/repositories/caregiver-pay-rates.ts; src/lib/schemas/caregiver-pay-rates.ts; src/app/actions/caregiver-profile.ts; src/app/actions/payroll-billing-report.ts; src/lib/payroll-billing-report.ts; src/lib/visit-approval-financials.ts; three agency caregiver/user-management pages; src/_tests_/caregiver-pay-rate-reads.test.ts; scripts/migrations/005-caregiver-pay-rate-read-access.sql; scripts/migrations/005-verify-caregiver-pay-rate-read-access.sql; docs/migrations/uat-caregiver-pay-rate-reads.md; credential/main/RLS migration docs; docs/hipaa/compliance-log.md.
- **Validation:** All 97 tests, TypeScript, focused lint, and whitespace checks passed. Seventeen new tests execute real policy SQL and transaction helpers with synthetic data, including negative tenant/membership/self-access tests, audit failure, parent rollback, and no-context denial. Standard lint retains the existing ESLint 9 configuration failure. The production build passed with synthetic service settings and existing React-hook warnings. The resulting synthetic artifact must not be deployed; rebuild with UAT configuration.
- **Remaining gaps:** 005 awaits manual Dev-first application. Pay-rate writes still depend on a missing function and need concurrency/history/audit and form-schema remediation before grants. Other payroll, schedule, contract, visit/financial access and mutation paths remain unaudited/incomplete; five staged tables remain closed. Supabase session/profile dependencies and live UAT runtime identity checks remain pending.

### Caregiver Pay-Rate Writes and Atomic Forms (2026-09-21)
- **Live evidence:** Read-only checks confirmed the expected 005 SELECT-only policy/grants and enabled/forced RLS on Dev/UAT. Relevant source and target columns were rechecked; no source records were queried or copied.
- **What:** Prepared 006 with manager-only INSERT/UPDATE policies, column-limited grants, amount/period checks, active-start uniqueness, and an invoker timeline guard. Replaced the missing append RPC with a server-only Neon repository using current active manager membership, deterministic advisory-lock ordering, and owned transactions.
- **Integrity/audit:** Backdated insertion respects neighboring periods; same-day corrections preserve the prior amount in zero-duration history. The resolver now uses exclusive end dates. Rate batches and combined profile/rate edits commit with identifier-only audits; failures roll back changes. Runtime cannot overwrite historical amounts/ownership/start/unit or delete rate history.
- **Forms:** Edit Caregiver now uses shared validation, noValidate, phone/email components, inline server errors, Sonner, and one combined save. The existing Rate Manager pay tab uses shared RHF batch validation, preserves units, and maps errors to changed rows. Its launch button remains commented out as before. The bill-rate tab's legacy schema/validation/action gaps remain explicitly deferred.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity. This does not certify all caregiver, billing, or financial writers or establish HIPAA readiness.
- **Files changed:** src/lib/repositories/caregiver-pay-rate-writes.ts; src/lib/schemas/caregiver-pay-rates.ts; src/lib/schemas/caregiver-edit.ts; src/app/actions/caregiver-pay-rates.ts; src/app/actions/payroll-billing-report.ts; src/components/EditStaffModal.tsx; src/components/PayrollBillingReportContent.tsx; src/lib/caregiver-pay-rates.ts; rate database/form tests; scripts/migrations/006-caregiver-pay-rate-write-access.sql; scripts/migrations/006-verify-caregiver-pay-rate-write-access.sql; pay-rate/main migration docs; docs/hipaa/compliance-log.md.
- **Remaining gaps:** 006 awaits manual Dev-first execution and live two-session concurrency/negative-access acceptance. Other generic caregiver mutation callers, contract/bill writes, visit/financial policies, and Supabase session dependencies remain pending. Five staged tables remain closed. No remote write, push, deployment, or production access occurred.

- **Final validation (2026-09-22):** All 117 tests across nine suites passed, including five form tests and fifteen additional write/schema/atomicity database tests. TypeScript, focused lint, whitespace checks, and the final production build passed. Standard lint still fails on the pre-existing ESLint 9 configuration issue. Build service settings were synthetic; the artifact is not deployable. Independent-connection Neon contention and live role acceptance remain pending manual Dev execution.

### Pay-Rate Write Migration Application Verification (2026-09-22)
- **Evidence:** After user execution of 006, read-only catalog checks on explicit Neon Dev/UAT branches returned write_access_pass=true. Verified forced RLS, SELECT/INSERT/UPDATE policies and active-membership scopes, column-limited INSERT/period-close UPDATE, denied historical amount UPDATE, enabled guard trigger, and valid/ready active-start index.
- **Remaining isolation:** Internal notes and four visit/financial staged tables retain forced RLS, zero policies, and no runtime table or column privileges.
- **Relevant safeguards:** Supports the existing migration evidence for 45 CFR 164.312(a)(1) Access Control and 164.312(c)(1) Integrity. This verification does not establish live authorization behavior or HIPAA readiness.
- **Scope:** No application records retrieved, remote writes, deployment, push, or production access. Only documentation changed; no application tests/build rerun.
- **Files changed:** docs/migrations/uat-caregiver-pay-rate-writes.md, docs/migrations/uat-rls-readiness.md, docs/migrations/uat-supabase-removal.md, docs/hipaa/compliance-log.md.
- **Remaining gaps:** Live synthetic edits, denial cases, independent-connection concurrency, and Azure runtime identity need acceptance. Next internal-note schema/policy work is paused because Supabase source MCP tools are unavailable; restore read-only source access to satisfy AGENTS.md live-schema requirements.

### Internal-Note Read Boundary and SELECT Migration (2026-09-22)
- **Live evidence:** Restored Supabase read-only tools; used list_tables, information_schema and policy/function catalogs. Inspected 253 source columns with matching types/nullability on explicit Neon Dev/UAT branches, plus audit metadata. Notes remain staged/closed before manual 007. No source records were queried or copied.
- **Access controls:** Prepared SELECT-only policy with current active Neon profile, active matching agency membership, actual subject-to-agency linkage and same-agency tags. Platform application notes and their counts are separated from agency patient/caregiver/visit notes. Source invited/pending acceptance and the application_playbook_item exclusion gap are not copied. Runtime receives no note writes.
- **Audit:** Panel, legacy reads, counts and tag lists have identifier-only audits in the same owned transaction; failures return no data. SEARCH validates scope and records only non-content trace metadata. Existing 600 ms debounce/three-character threshold is preserved. Stale panel responses and failed reload data are cleared.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish full HIPAA readiness.
- **Files changed:** src/lib/repositories/internal-note-reads.ts; src/lib/schemas/internal-notes.ts; src/app/actions/internal-notes.ts; src/app/actions/playbooks.ts; src/lib/supabase/query/internal-notes.ts; src/components/InternalNotesPanel.tsx; src/components/ApplicationDetailContent.tsx; src/components/ExpertStepsPanel.tsx; internal-note database/panel tests; scripts/migrations/007-*; docs/migrations/uat-internal-note-reads.md; main/RLS migration docs; docs/hipaa/compliance-log.md.
- **Validation:** Twenty database-policy/authorization/audit tests and three panel/debounce/race tests pass alongside 117 existing tests (140 total). TypeScript and focused lint pass with existing unrelated hook warnings. Standard lint retains the ESLint configuration failure. Final TypeScript and the 23 focused note tests passed after returning plain arrays from the panel boundary; the production build passed with synthetic service settings and existing hook warnings. The synthetic artifact is not deployable; rebuild with UAT configuration.
- **Remaining gaps:** Manual 007 execution and live role/runtime acceptance; legacy add/edit/delete forms lack shared RHF/Zod/noValidate and complete field-error/Sonner handling. Application-status and playbook note writers remain non-atomic/incomplete; keep write grants closed and main deployment held. Shared requirement-template IDs are not application-owned subjects and remain unreadable until reviewed reconciliation. Four visit/financial tables, other providers/authentication, Azure runtime identity and broader audit coverage remain pending.

### Internal-Note Read Application and Write Boundary (2026-09-22)
- **Live evidence:** After user execution of 007, read-only checks on explicit Neon Dev/UAT branches confirmed forced RLS, runtime SELECT, no INSERT/UPDATE/DELETE, and exactly `internal_notes_scoped_select`. No records, production branch, or remote writes were accessed.
- **What:** Prepared 008 and moved panel mutations, application status notes, and playbook note copying to a server-only repository. It reloads the active Neon actor, requires active matching memberships, validates actual subject/agency and tag ownership, separates platform from agency notes, and rejects shared template identifiers.
- **Integrity/audit:** Each note mutation and its identifier-only audit commit together; audit failure rolls back the note. Runtime scope/authorship columns remain immutable. Content is excluded from logs. Delete retains an immutable audit event but remains a hard delete under the existing data model.
- **Relevant safeguards:** 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish HIPAA readiness.
- **Files changed:** note schemas/repository/actions/query compatibility layer; application/playbook callers; 008 migration/verification; focused database tests; internal-note/main migration docs; this log.
- **Validation:** Twenty-seven focused note tests and the full 144-test/11-suite run pass. TypeScript, focused legacy-config ESLint, whitespace checks, and a clean production build pass. Standard ESLint 9 still lacks a flat configuration; the build retains existing Edge-runtime/Supabase/bcrypt and React-hook warnings.
- **Application evidence:** The user applied 008 to Dev and UAT. Read-only catalog checks confirmed forced RLS, all four expected policies, helper execution, scoped insert/update/delete grants, and denied agency-column UPDATE on both branches. UAT remains intentionally unused until matching code deployment.
- **Completed remediation:** The panel now uses shared RHF/Zod validation, `noValidate`, inline/server errors, and Sonner. Manual application status, its audit, its note and note audit commit atomically. Playbook migration reloads the active platform actor and wraps item creation, copied notes and its identifier-only audit in one transaction.
- **Final validation:** Twenty-eight focused note tests and the full 145-test/11-suite run pass. TypeScript, focused legacy-config ESLint, whitespace checks, and a production build pass with existing unrelated warnings.
- **Subject remediation:** Application document note controls and count requests now use actual application_documents IDs; empty shared requirement slots expose no note action. Application step controls already use application_steps IDs. RLS retains rejection of shared template identifiers.
- **Remaining gaps:** Live synthetic note acceptance remains. Four visit/financial tables, Realtime, storage, session migration, and final environment cleanup remain pending; deployment/main push remains held.

### Visit and Financial Cutover Discovery (2026-09-22)
- **Live evidence:** Compared the four staged visit/financial tables with the live Supabase source and inspected source policies/constraints. No source rows, production branch, or remote writes were accessed.
- **Finding and correction:** The approval/void helper attempted to insert nonexistent `visit_adjustment_history.comment`. It now uses the source-defined previous/current actual and billable hour fields plus `note`. No access grant accompanies this correction.
- **Access findings:** Existing page/actions trust session-derived agency/role, one sidebar badge still queries Supabase in the browser, caregiver clock functions are absent from Neon, and multi-table approval/void/backfill paths do not yet own complete transactions.
- **Safeguards:** This review supports 45 CFR 164.312(a)(1), 164.312(b), and 164.312(c)(1) by keeping forced-RLS tables closed until current-identity authorization, transaction ownership, and audit rollback are implemented.
- **Validation:** TypeScript and focused lint pass for the schema-alignment correction.
- **Remaining remediation:** Implement the documented 009 read boundary, 010 caregiver execution writes, 011 coordinator approval/void transaction, and 012 financial maintenance workflow before opening runtime access.

### Manager Visit-Financial Read Boundary (2026-09-22)
- **What:** Prepared 009 SELECT-only access for active company owners/care coordinators with active matching membership and linked visit/time-entry ownership. Time & Billing reloads the current Neon actor and agency; the sidebar badge no longer queries Supabase from the browser.
- **Audit:** Dashboard resource identifiers and pending-count metadata are written in the same transaction before data/counts return. Audit failure fails closed.
- **Safeguards:** Supports 45 CFR 164.312(a)(1), 164.312(b), 164.312(c)(1), and 164.312(d). Caregiver reads and every mutation remain denied.
- **Validation:** Fifteen disposable staging/policy tests execute 002/009 and cover exact policies, active membership, invited denial, and write denial. The full 147-test/11-suite run, TypeScript, focused lint, whitespace checks, and a production build pass with existing unrelated warnings.

### Manager Read Verification and Caregiver Visit Execution Boundary (2026-09-22)
- **Live evidence:** The user applied 009 to Neon Dev/UAT. Read-only catalog checks confirmed forced RLS, exact manager SELECT policies, runtime SELECT, denied runtime writes, and `read_access_pass=true` for all four visit/financial tables on both branches. The live Supabase function definitions and source/target visit, task, caregiver, time-entry, and financial columns were inspected without reading application records.
- **What:** Prepared 010 and replaced three missing Supabase caregiver RPC calls plus the direct note update with an application-owned Neon repository. It reloads the current active caregiver/profile/membership, locks and verifies the assigned visit, validates UUID/note/coordinate input, and owns each transaction. Caregiver list, detail, and summary reads now use the same current-identity boundary; the shared detail cache was removed so revocation and audit checks run on every request.
- **Access and integrity:** Assigned-caregiver time-entry SELECT/INSERT/UPDATE policies and column grants exclude ownership, approval, adjustment, and rate fields. Task UPDATE is reduced to completion timestamp fields. A migration-owned trigger derives the pending financial record on the first clock-out, while the runtime role retains no financial writes. Scheduled visit/task table-wide RLS remains a documented follow-up because those legacy tables serve several unaudited cross-role workflows.
- **Audit:** Clock, task, note, list, detail, and summary events commit in the same transaction as their operation. Details contain identifiers, operation names, completion/geolocation booleans, and note length; note content and coordinates are not logged.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. It does not establish HIPAA readiness.
- **Files changed:** caregiver execution schema/repository/actions/pages/cache boundary; 010 migration/verification; focused database tests; caregiver/visit/main migration docs; this log.
- **Validation and remaining gaps:** All 149 tests across 11 suites, TypeScript, focused legacy-config lint, whitespace checks, and a clean production build pass. After the user applied 010 to Dev and UAT, read-only verification confirmed every expected RLS, grant, helper, trigger, and denial flag with `access_pass=true` on both branches; the first-run missing-trigger notice was the expected result of `DROP TRIGGER IF EXISTS`. Live synthetic role acceptance, scheduled visit/task RLS, coordinator financial mutations, Azure runtime identity, and wider provider removal remain pending. No agent remote write, push, deployment, production access, or PHI access occurred.

### Manager Approval and Void Boundary (2026-09-22)
- **What:** Prepared migration 011 and moved Time & Billing approval/void decisions to a server-only repository. It reloads the current active manager profile and matching active agency membership, validates shared input, locks linked visit/time-entry/approval/financial rows, and commits adjustment history, approval, frozen financial calculations, time-entry state, and audit events atomically. The former non-atomic helper has no callers and now fails closed if invoked.
- **Access and integrity:** RLS permits only active `company_owner` and `care_coordinator` actors with matching active membership and linked records. Runtime grants are column-limited; scope and ownership columns remain immutable; adjustment history is insert-only; DELETE remains denied. Existing approved rates are frozen when a decision is revised.
- **Audit:** Each successful decision records identifier-only events for the time entry, approval, and financial row in the same transaction. Audit details contain decision state and booleans for changed hours and note presence; they exclude note text and financial amounts.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish HIPAA readiness.
- **Files changed:** src/lib/schemas/time-billing.ts; src/lib/repositories/visit-financial-writes.ts; src/app/actions/time-billing.ts; retired legacy approval helper; scripts/migrations/011-*; focused database tests; visit-financial/main migration docs; this log.
- **Validation:** All 151 tests across 11 suites, TypeScript, focused legacy-config lint, whitespace checks, and the production build pass. The build retains existing unrelated React-hook and Browserslist warnings. Standard lint retains the pre-existing ESLint 9 flat-config gap.
- **Live verification and correction:** Read-only inspection confirmed the user had applied the initial 011 draft to Dev/UAT: all seven policies, expected INSERT grants, and immutable-history denials are present. The two manager UPDATE policies use the earlier agency-only old-row predicate while retaining linked-record new-row checks. Prepared 011a to replace only those two policies with linked-record checks on both old and new row states; no table data or grants change.
- **Remaining gaps:** Migration 011a and live synthetic acceptance remain manual Dev/UAT gates. Migration 012 financial maintenance, scheduled visit/task RLS, Azure runtime identity, storage, Realtime, remaining database callers, Auth.js completion, deployment, and environment cleanup remain pending. No agent remote write, push, deployment, production access, or PHI access occurred.

### 009/010 Live Definition Reconciliation (2026-09-22)
- **Evidence:** At the user's request, read-only catalog inspection compared Neon Dev and UAT with the final local 009/010 definitions. Both branches match the current manager/caregiver policy predicates, active-profile and active-membership helper bodies, caregiver membership linkage, clock-out trigger body and trigger event, function visibility, and 010-specific column grants/denials. All four financial tables retain enabled and forced RLS.
- **Result:** No 009 or 010 corrective migration is required. Later 011 grants explain the additional manager time-entry UPDATE columns visible in the cumulative live state; agency/ownership UPDATE remains denied. The pre-existing scheduled-task INSERT privilege is outside 010's caregiver completion grant and remains part of the documented scheduled visit/task RLS follow-up.
- **Scope:** No application rows, PHI, remote writes, deployment, push, or production resources were accessed. This was a read-only policy/function/grant reconciliation; tests and build were not rerun.

### Financial Maintenance Boundary (2026-09-22)
- **Live evidence:** Read-only verification returned `policy_hardening_pass=true` for both 011a policies on Neon Dev/UAT. Source and target metadata for contracts, visits, financial snapshots, and audits match for the columns used by 012; no application records were read.
- **What:** Contract bill-rate batches, visit mileage, payroll/billing report reads, and Rate Manager reads now reload the active manager and active matching agency membership. Contract batches lock deterministically and commit with audits. Report and rate reads are agency-scoped and audited in their transaction.
- **Integrity/audit:** Contract rate changes no longer insert or update historical `visit_financials`; frozen approved/voided snapshots remain unchanged. Mileage and rate audit failure rolls back the mutation. Audit details contain identifiers, operation names, counts, field names, and state booleans without names, notes, mileage values, or monetary values.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish HIPAA readiness.
- **Validation:** Transaction and UI tests cover batch atomicity, cross-agency and invited denial, audit rollback, mileage validation, shared bill-rate validation, and single-call batches. All 157 tests across 12 suites, TypeScript, focused lint, whitespace checks, and the production build pass with existing unrelated warnings. No 012 SQL migration is required because no access is opened.
- **Remaining gaps:** The bill-rate table is not yet React Hook Form and does not map batch errors inline. Read-only catalog inspection confirmed the four Supabase contract lifecycle functions called by the transitional query layer are absent from Neon Dev/UAT; replace that lifecycle with an owned server repository next. Legacy scheduled visit/task/contract RLS, explicit historical correction workflow, Azure runtime identity, storage, Realtime, remaining callers, Auth.js completion, deployment, and environment cleanup remain pending. No agent remote write, push, deployment, production access, or PHI access occurred.

### Patient Service-Contract Lifecycle Discovery (2026-09-22)
- **Evidence:** Read-only function catalogs confirm four source Supabase lifecycle functions and zero matching functions on Neon Dev/UAT. The local append callers use a positional order that differs from the live source signature. No application rows were accessed.
- **Risk:** Contract and weekly-hour mutations currently depend on absent functions, broad non-RLS table privileges, session-profile authorization in the generic bridge, and multi-step error handling that can commit partial work without audit rollback.
- **Decision:** The discovery hold was satisfied by the prepared lifecycle boundary recorded below. Frozen visit-financial snapshots remain unchanged.
- **Relevant safeguards:** 45 CFR 164.312(a)(1), 164.312(b), 164.312(c)(1), and 164.312(d). No remote writes, deployment, push, production access, or PHI access occurred.
- **Remaining remediation:** Apply and verify 013 on Dev before unused UAT, then complete live synthetic lifecycle acceptance.

## 2026-09-22 — UAT patient service-contract lifecycle boundary (prepared)

- Replaced missing Supabase contract lifecycle functions and unsafe direct contract writes with a server-only Neon repository that reloads the current active agency manager and active membership, validates patient agency ownership, locks affected rows, and commits identifier-only audit events in the same transaction as each read or mutation.
- Prepared migration 013 to force RLS on `patient_service_contracts`, enforce patient/agency linkage in SELECT/INSERT/UPDATE/DELETE policies, keep agency and patient ownership columns immutable, restrict mutable columns, and add the scoped timeline index. This supports 45 CFR 164.312(a)(1), 164.312(b), and 164.312(c)(1).
- Files: `src/lib/repositories/patient-service-contracts.ts`, `src/lib/schemas/patient-service-contracts.ts`, the two transitional query wrappers, `src/app/actions/query-bridge.ts`, `src/components/ClientDetailContent.tsx`, `scripts/migrations/013-*`, and `src/_tests_/patient-service-contracts.test.ts`.
- Validation: five focused lifecycle/policy tests and the full 162-test suite pass, together with TypeScript, focused lint, whitespace checks, and a production build. Existing React-hook and Edge-runtime warnings remain.
- Remaining gap: migration 013 has not yet been applied or verified on Dev/UAT, live workflow acceptance is pending, and the modal still needs the shared React Hook Form/inline field-error pattern. No PHI or production data was introduced.

### Patient Service-Contract 013 Live Verification (2026-09-22)

- **Evidence:** After user execution, independent read-only catalog checks returned `access_pass=true` on Neon Dev and UAT. Both branches have forced RLS, the four exact manager policies, scoped insert and lifecycle-update privileges, immutable agency/patient ownership columns, and the timeline index.
- **Scope:** No application rows, remote writes, production resources, or PHI were accessed by the verification. Live synthetic role/workflow acceptance and the modal validation follow-up remain pending.

### Scheduling Lifecycle Discovery (2026-09-22)

- **Evidence:** Live source and Neon Dev/UAT column signatures match for `scheduled_visits`, `scheduled_visit_tasks`, and `visit_series`. Both Neon branches have RLS disabled, zero policies, and broad runtime privileges on these tables. No application rows were read.
- **Risk:** Manager schedule and recurrence writes share low-level functions with caregiver/server reads, trust the generic session-profile bridge, and can commit partial recurring updates without an atomic audit boundary. The caregiver task-completion column grant currently lacks table RLS defense in depth.
- **Remediation:** Convert callers to current-identity manager and assigned-caregiver repositories with linked-record validation and atomic audits before preparing migration 014. This supports 45 CFR 164.312(a)(1), 164.312(b), and 164.312(c)(1). No remote write, production access, or PHI access occurred.

### Scheduling Lifecycle Boundary (2026-09-23)

- **What:** Manager schedule, recurrence, task-replacement, assignment, and lifecycle operations now use a server-only Neon repository that reloads the current active manager and active agency membership, validates every linked record, locks deterministically, and commits identifier-only audits with the business mutation. Recurring item failures now roll back the entire operation.
- **Access and integrity:** Prepared migration 014 to force RLS on `scheduled_visits`, `scheduled_visit_tasks`, and `visit_series`. Manager policies require current active agency membership and linked-record ownership. Caregiver policies permit visibility of assigned or open visits and completion-only task updates; caregivers receive no assignment, recurrence, schedule-definition, or delete privilege. Ownership and scope columns remain immutable through the runtime role.
- **Audit:** Schedule mutations record actor, agency, resource identifiers, operation, and limited state metadata in the same transaction. Audit details exclude patient/caregiver names, task text, notes, addresses, and other PHI content.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish HIPAA readiness.
- **Files changed:** `src/lib/schemas/scheduling.ts`, `src/lib/repositories/manager-scheduling.ts`, manager query/action/dashboard callers, `scripts/migrations/014-*`, `src/_tests_/manager-scheduling.test.ts`, migration records, and this log.
- **Validation:** Four focused database tests and the complete 166-test/14-suite run pass. TypeScript, focused legacy-config ESLint, whitespace checks, and the production build pass; existing React Hook and stale Browserslist warnings remain. Standard lint retains the existing ESLint 9 flat-config launcher gap.
- **Remaining gaps:** Migration 014 and its verification require manual Dev-first execution, followed by unused UAT only after Dev passes. Live synthetic manager/caregiver and cross-agency acceptance remains pending. The scheduling UI still needs the shared React Hook Form and inline field-error pattern. No agent remote write, push, deployment, production access, or PHI access occurred.

### Scheduling Migration 014 Live Verification (2026-09-23)

- **Evidence:** After user execution, independent read-only checks on explicit Neon Dev and UAT branches returned `access_pass=true` for `scheduled_visits`, `scheduled_visit_tasks`, and `visit_series`, plus `runtime_helper=true` and `helper_not_public=true` on both branches.
- **Controls verified:** All three tables have enabled and forced RLS, exact expected policy counts, required indexes, runtime SELECT, immutable agency scope, and the intended scoped write privileges. The caregiver helper is executable by `mycaresight_app` and unavailable to PUBLIC.
- **Scope and remaining gaps:** No application rows, PHI, production resources, or remote writes were accessed by the agent. Live synthetic manager/caregiver and cross-agency acceptance, remaining direct Supabase callers, Realtime replacement, record-authorized Azure storage, Auth.js database sessions, and final environment cleanup remain pending.

### Agency Caregiver Dashboard Read Boundary (2026-09-23)

- **Evidence:** Live Supabase source and Neon Dev/UAT metadata agree on the caregiver member and credential columns used by this slice. The former dashboard query referenced nonexistent `caregiver_credentials.days_until_expiry`; the replacement derives the 30-day count from the verified `expiration_date` column. No application records were read.
- **What:** Both agency caregiver dashboard pages now obtain total staff, active staff, and expiring-credential counts through an application-owned Neon repository instead of Supabase server clients.
- **Access and audit:** The repository reloads the current active company owner or care coordinator and matching active agency membership, rejects mismatched agency input, scopes member and credential counts to the verified agency, and commits an identifier-only read audit before returning results. Audit failure returns no statistics.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish HIPAA readiness.
- **Files changed:** `src/lib/repositories/agency-caregiver-dashboard.ts`, both agency caregiver dashboard pages, focused database tests, migration records, and this log.
- **Validation and limits:** All 169 tests across 15 suites, TypeScript, focused legacy-config ESLint, whitespace checks, and the production build pass. Existing React Hook and stale Browserslist warnings remain. Live workflow acceptance remains pending. Further database-specific caller conversion is paused because the Supabase read-only MCP connection subsequently failed OAuth token refresh twice. No agent remote write, deployment, push, production access, or PHI access occurred.

### Platform and Agency Server Page Read Boundary (2026-09-23)

- **Evidence:** Read-only live metadata checks confirmed the referenced application, identity, configuration, playbook, lead, and audit columns on Supabase and both Neon Dev/UAT. No application rows or PHI were queried.
- **What:** Eight server-rendered platform and agency pages now use application-owned Neon repositories instead of direct Supabase server clients for dashboard counts, reference resolution, expert email, expert playbook, lead-detail authorization, and lead-pipeline counts.
- **Access and audit:** The repositories reload the current active actor. Admin reads require the admin role; expert playbook reads require current assignment; agency lead reads require a current active manager membership and matching lead ownership. Identifier-only audits commit before data is returned, and audit failure suppresses the result.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish HIPAA readiness.
- **Files and validation:** `src/lib/repositories/platform-application-dashboard.ts`, `src/lib/repositories/agency-lead-reads.ts`, the eight converted pages, focused database tests, and `docs/migrations/uat-server-page-reads.md`. The complete 178-test/17-suite run, TypeScript, focused legacy-config ESLint, whitespace checks, and the production build pass. Pre-existing React Hook and stale Browserslist warnings remain.
- **Remaining gap:** The agency landing page notification query is the last direct Supabase server-client page import. Notification actions still require current-identity hardening, and Neon Dev/UAT currently have runtime table access without notification RLS. Realtime replacement, storage authorization, Auth.js database sessions, deployment validation, and environment cleanup remain pending. No remote write, push, deployment, production access, or PHI access occurred.

### Notification Current-Identity Boundary (2026-09-23)

- **Evidence:** Read-only source/target metadata confirms matching notification, identity, membership, and audit columns. Neon Dev/UAT currently grant runtime SELECT while notification RLS is disabled and no policies exist. No notification rows, message content, PHI, or production resources were accessed.
- **What:** Personal notification reads, counts, read-state updates, and deletes now use a server-only Neon repository. The agency dashboard no longer creates a Supabase server client, leaving zero such imports under `src`.
- **Access and integrity:** The repository reloads the current active user, requires active agency membership for agency/caregiver roles, rejects mismatched supplied user IDs, and scopes mutations to the current user's rows. Identifier-only audit failure suppresses reads and rolls back writes.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(d) Person or Entity Authentication. This does not establish HIPAA readiness.
- **Validation:** Three focused notification tests and the complete 181-test/18-suite run pass, together with TypeScript, focused legacy-config ESLint, whitespace checks, and a clean production build. Existing hook, Browserslist, and transitional Edge-runtime warnings remain.
- **Realtime and remaining gap:** The notification dropdown now polls the current-identity server boundary every 30 seconds while visible and refreshes on focus/open, removing its Supabase browser client and user-filtered Realtime channels. Live catalogs show 21 notification-related functions on Supabase and none on Neon Dev/UAT. Forced notification RLS must wait until the application producers are moved behind authorized recipient-aware operations. Six other message/program Realtime consumers remain. No remote write, migration application, push, deployment, or environment-variable removal occurred.

### Public and Account Entrypoint PostgreSQL Cutover (2026-09-23)

- **What:** The public contact route now uses shared server validation and an application-owned PostgreSQL repository. The onboarding agency lookup and admin-user agency mapping also use the existing PostgreSQL query boundary, removing the last non-auth Supabase admin-client consumers.
- **Integrity and audit:** Contact submission rate checks serialize by normalized-email advisory lock; the lead and identifier-only audit commit together. Audit failure rolls back the lead. Email delivery happens after commit and cannot duplicate or discard an accepted lead.
- **Relevant safeguards:** Supports 45 CFR 164.312(b) Audit Controls and 164.312(c)(1) Integrity. Contact leads must remain synthetic/non-PHI in this pre-HIPAA environment.
- **Files changed:** `src/app/api/contact/route.ts`, `src/lib/repositories/public-contact.ts`, `src/lib/schemas/public-contact.ts`, onboarding/admin-user pages and query helper, focused tests, and migration records.
- **Remaining gaps:** Dev/UAT synthetic workflow acceptance remains pending. This does not establish HIPAA readiness, and no agent remote write, deployment, push, production access, or PHI access occurred.

### Auth.js Opaque PostgreSQL Session Foundation (2026-09-23)

- **What:** Kept Auth.js Credentials and replaced its cookie JWT contents with a random opaque token backed by a SHA-256 token hash and revocation record in PostgreSQL. Login, current identity, password recovery, and password changes no longer use the Supabase admin client. Current active profile and active matching membership are checked during session decoding and again at the shared session boundary.
- **Credential controls:** New password writes use Argon2id. Existing bcrypt hashes are accepted only for migration and upgraded after successful verification. Reset tokens are high entropy, stored only as hashes, expire after one hour, are single use, and revoke active sessions. New reset links carry the credential in a URL fragment so web servers do not receive it; the reset page immediately removes it from browser history and retains compatibility with previously issued query-string links. Reset responses do not enumerate registered accounts or log plaintext reset links.
- **Access and revocation:** Prepared migration 015 adds restricted session, reset-token, and durable account/IP rate-limit tables. Database triggers revoke active sessions on profile activation, role, agency, email, password-hash, or agency-membership changes. Logout revokes its server session.
- **Audit:** Successful login, reset request, password reset, and automatic session revocation create identifier-only audit evidence. Rate-limit subjects and limited request metadata are HMAC-derived; passwords, reset tokens, email addresses, and PHI are excluded from application logs.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(a)(2)(iii) Automatic Logoff, 164.312(b) Audit Controls, 164.312(d) Person or Entity Authentication, and 164.312(e)(1) Transmission Security. This does not establish HIPAA readiness or MFA completion.
- **Files changed:** `src/auth.ts`, `src/lib/auth.ts`, `src/lib/auth/password.ts`, `src/lib/repositories/auth-identity.ts`, password-writing actions, reset UI/action, `src/middleware.ts`, migration 015 and verification, tests, package files, and migration records.
- **Validation and remaining gaps:** The migration executes in synthetic PostgreSQL and its identity-change trigger revokes the session with audit evidence. Password compatibility tests, all 190 tests across 21 suites, TypeScript, focused legacy-config ESLint, and the production build pass. Existing unrelated React Hook and Browserslist warnings remain. The user applied migration 015 to Neon Dev and UAT; independent read-only verification returned `access_pass=true` on both branches for all prepared catalog controls. Local unauthenticated smoke tests confirm the login page loads, the session endpoint returns no session, and a protected admin page redirects to login. Credentialed Dev login reaches the protected admin page and independently verified database evidence shows a valid stored token hash, one login audit, and bcrypt-to-Argon2id upgrade. Logout leaves zero active sessions, marks the session revoked with reason `sign_out`, and returns the browser to login. A legacy JWT cookie was rejected and cleared once before the new login. Password reset completed for a caregiver test identity and wrote an Argon2id hash; subsequent login failed closed because its profile role conflicted with its sole active membership and linked caregiver record. Migration 015a narrowly reconciles that one unambiguous `company_owner` to `staff_member` mismatch, refuses a different candidate count, revokes sessions through the existing trigger, and records an identifier-only audit. The user applied it to Dev and then successfully logged into the caregiver screen with the reset password; UAT application remains pending. Reset replay/password-change revocation/inactive-membership/lockout acceptance, retention cleanup, MFA, Azure runtime validation, storage migration, deployment, and environment cleanup remain pending. No agent remote write, push, deployment, production access, or PHI access occurred.

### Supabase Realtime Removal (2026-09-23)

- **What:** Removed every Supabase Realtime channel from application source. Authenticated server-action polling now refreshes message threads and application progress every 15 seconds and notifications every 30 seconds, pauses for hidden tabs, prevents overlapping calls, refreshes when the user returns, and updates local sends immediately.
- **Access and audit:** Polling does not expose database credentials or accept a browser-supplied actor as authorization. The expert message total moved from a direct browser Supabase count to the current-identity PostgreSQL message boundary, which scopes authorized conversations and writes identifier-only read evidence without message content.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(e)(1) Transmission Security. This does not establish HIPAA readiness.
- **Files changed:** shared visible-polling hook, six message/program screens, message repository/action exports and tests, migration records, and this log.
- **Validation and remaining gaps:** All 192 tests across 22 suites pass, including visible/hidden/focus polling and authorized message-count coverage. TypeScript, focused legacy-config ESLint, whitespace checks, and the production build pass; existing unrelated React Hook and stale Browserslist warnings remain. Direct browser business queries and transitional storage helpers still require Supabase. UAT synthetic multi-user polling acceptance, storage cutover, remaining database-call conversion, Azure runtime validation, deployment, and environment cleanup remain pending. Migration 015a has passed Dev post-reset login but remains to be applied and verified on UAT. No agent remote write, deployment, push, production access, or PHI access occurred.

### Azure Storage Authorization Boundary (2026-09-23)

- **What:** Replaced arbitrary browser-selected upload containers and paths with purpose/resource requests. The server reloads the active actor, verifies record and agency access, selects the container, generates an opaque object path, enforces a 10 MB size limit and media-type allowlist, and records the upload before returning it. Private downloads resolve an exact database record before issuing a bounded Azure URL. Cleanup requires a signed 15-minute token bound to the actor and exact new object.
- **Access and integrity:** Application, license, caregiver credential, patient, incident, lead, agency, and reference-template paths have explicit access rules. Missing and forbidden objects share a 404 response. Audit failure removes a new upload. A stale caregiver license flow was corrected to write `license_documents` instead of placing a license ID in `application_documents`.
- **Audit:** Signed URL, upload, and cleanup operations write identifier-only evidence. Audit details exclude object paths, original filenames, document contents, and other PHI.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, and 164.312(e)(1) Transmission Security. This does not establish HIPAA readiness.
- **Files changed:** `src/lib/storage/`, both storage API routes, seven browser upload consumers, focused tests, migration records, and this log. The provider-named Supabase storage helper was removed.
- **Validation and remaining gaps:** Nine focused tests and TypeScript pass; source scans show no caller-selected upload bucket/path, direct Supabase Storage call, Realtime call, or old storage-helper import. Standard lint remains blocked by the existing ESLint 9 configuration gap. Live Azure managed-identity, private-container, upload/download/delete, and cross-agency acceptance remain pending. Malware scanning/quarantine must be enabled and validated before PHI-bearing uploads. Existing object copy/reconciliation, remaining direct Supabase database callers, deployment, and environment cleanup remain pending. No remote write, deployment, push, production access, or PHI access occurred.

### Auth 015a UAT Verification (2026-09-23)

- **Evidence:** After user execution, independent read-only UAT verification returned zero remaining unambiguous profile/membership role mismatches, zero orphaned profiles, one reconciliation audit row, and `reconciliation_pass=true`.
- **Scope:** No application records, PHI, production resources, or remote writes were accessed by the agent. Remaining authentication denial/revocation acceptance cases and deployment validation are unchanged.

### UAT Supabase Runtime Dependency Removal (2026-09-23)

- **What:** Removed the remaining Supabase client factories, SDK packages, UAT build credentials, image-host allowlists, direct browser/database calls, and provider-specific runtime usage. Business reads now cross authenticated server actions into application-owned PostgreSQL repositories; files cross the record-authorized storage boundary.
- **Access and audit:** Agency workflows require current active membership, platform workflows require the current privileged role or assignment, and storage operations resolve exact records before access. Audit metadata was further limited by removing contact names and availability dates from touched mutation events.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, 164.312(d) Person or Entity Authentication, and 164.312(e)(1) Transmission Security. This does not establish HIPAA readiness.
- **Files:** Supabase client factory/type files, package manifests, UAT workflow, Next.js config, server actions and UI callers, environment/setup documentation, migration records, and the Supabase-removal regression test.
- **Remaining gates:** UAT deployment and synthetic role/cross-agency regression, Azure managed-identity and private-container validation, malware scanning/quarantine before PHI, and remaining authentication denial/revocation acceptance are required before removing UAT runtime settings or introducing PHI. Production was not accessed or changed.
- **Validation:** All 203 tests across 25 suites pass; the final dependency/storage subset passes 11 tests. TypeScript, whitespace checks, focused legacy-config ESLint, and the production build pass. Focused lint reports two existing hook warnings and no errors; the standard lint launcher retains the existing ESLint 9 configuration gap.

### UAT Background-Job Security Foundation (2026-09-24)

- **What:** Prepared migration 016 for the three scheduled workloads omitted from the initial UAT runtime cutover. It adds forced-RLS job-run, item, and outbox tables; idempotency, bounded claim, retry, and dead-letter state; a restricted mycaresight_jobs login; column-limited business-table grants; and database-owned visit-status calculation and synchronization functions.
- **Audit and data minimization:** Job control rows allow only opaque record identifiers, fixed status/count fields, and allowlisted error codes. Names, addresses, email addresses, task text, visit descriptions, notes, and message bodies are prohibited from job tracking and future queue messages.
- **Integrity and scale:** Unique schedule and item keys prevent duplicate effects. Partial claim indexes support concurrent queue workers, while the status operation remains set-based. Terminal visit states are preserved and multi-day end dates are included in status calculation.
- **Credential remediation:** Inspection found a previously committed Neon runtime-role password in scripts/neon-runtime-role-setup.sql. The tracked value was replaced with a fail-closed placeholder. Dev and UAT runtime-role credentials must be rotated and their application connection settings updated before merge. The Neon production branch does not contain the affected role.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, 164.312(d) Entity Authentication, and 164.312(e)(1) Transmission Security.
- **Files:** scripts/neon-runtime-role-setup.sql, scripts/neon-runtime-role-rotate.sql, scripts/neon-job-role-setup.sql, migration 016 and verification, and docs/migrations/uat-background-jobs.md.
- **Validation and remaining gaps:** Live source and Neon Dev schemas match for all seven touched business tables. The migration and verification execute in local PostgreSQL-compatible validation with access_pass=true, and the user applied and verified 016 on Dev. The isolated Azure Functions worker type-checks, builds, and passes focused UTC/error-sanitization tests. Its timers default disabled; deployment is manual-only. UAT execution, live synthetic worker acceptance, Azure resources, Key Vault, telemetry alerts, BAAs, and recovery exercises remain pending. This does not establish HIPAA readiness and no PHI was accessed.

### Background-Job Role Reset Recovery (2026-09-24)

- **What:** A Dev credential reset recreated `mycaresight_jobs`, removing the grants and RLS policies bound to the former role. Added idempotent migration 016a to restore only the job service's column-limited grants, function execution rights, and eight named RLS policies. Strengthened migration 016 verification to require all eight policies to target the current role.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity by failing closed after credential replacement and making restoration independently verifiable.
- **Files:** `scripts/migrations/016a-restore-background-job-role-access.sql`, `scripts/migrations/016-verify-background-job-foundation.sql`, and this log.
- **Validation and remaining gaps:** The user applied 016a on Dev. Independent read-only verification and a live job-role smoke test confirmed all eight policies, least-privilege control-table access, three successful discovery/status runs, duplicate schedule suppression, and sanitized error state. UAT has not been changed.

### Background-Job Dev Worker Acceptance (2026-09-24)

- **What:** Added migration 016b to enforce one recurring visit per series/date while leaving standalone visits unrestricted. Corrected the worker's column-qualified claim/retry SQL, removed a broad template `SELECT *`, matched the queue producer and trigger names, prevented disabled workers from acknowledging messages, and made timer/dispatcher failures close durable run records.
- **Access and integrity:** Live aggregate checks found zero pre-existing series/date duplicates in Supabase, Neon Dev, and Neon UAT. The job role continues to receive only required columns; notification access adds read permission only for the generated ID required by `INSERT ... RETURNING`.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, and 164.312(c)(1) Integrity. Queue delivery remains at-least-once, with database leases and unique idempotency keys suppressing duplicate effects.
- **Files:** Azure Functions worker/discovery/status/outbox/queue registration, migrations 016/016a/016b and verifications, UAT job runbook, focused Dev smoke harnesses, and this log.
- **Validation and remaining gaps:** The user applied and independently verified 016b and 016c on Dev. Independent read-only verification confirms the reminder worker can read only the generated notification ID while notification content and recipient columns remain blocked. Two synthetic weekly refill items produced exactly two visits 21 days ahead; one was scheduled and one correctly unassigned, task copies matched templates, redelivery was skipped, no duplicate series/date rows exist, and no item entered retry/dead-letter. Outbox rows remained unpublished and no email was sent. TypeScript, build, focused tests, and whitespace checks pass. UAT migrations, reminder delivery acceptance, Azure resources/identity/queue/Key Vault/alerts, and recovery exercises remain pending. No PHI was accessed.

### Background-Job UAT Database Foundation (2026-09-24)

- **Evidence:** After user execution, independent read-only UAT checks confirmed migration 016 tables, forced RLS, all eight role-bound policies, restricted job access, and status-sync execution; migration 016b's valid partial unique index with zero duplicate series/date groups; and migration 016c's notification-ID-only read access with message and recipient columns blocked. All three verification gates returned `access_pass=true`.
- **Scope and remaining gates:** No UAT job was executed and no queue message, notification, email, or visit was created. The UAT job connection string must be stored in Key Vault and exposed only to the disabled-by-default Function App through managed identity. Azure resource, deployment, telemetry, reminder delivery, rollback, and recovery validation remain pending. No PHI was accessed.

### Background-Job UAT Infrastructure Definition (2026-09-24)

- **What:** Added a resource-group-scoped Azure Bicep definition and manual what-if/deploy workflow for a West US 2 Flex Consumption Function App, dedicated storage queue, user-assigned managed identity, RBAC-enabled Key Vault, Log Analytics, Application Insights, and Key Vault/queue diagnostics. All functions and the application-level job switch deploy disabled.
- **Access and data minimization:** Azure host storage uses managed identity with shared-key access disabled. The Function App receives the Neon and Mailgun values only through Key Vault references. Queue messages remain limited to opaque outbox IDs; infrastructure tags and deployment parameters contain no PHI or secrets.
- **Relevant safeguards:** Supports 45 CFR 164.312(a)(1) Access Control, 164.312(b) Audit Controls, 164.312(c)(1) Integrity, 164.312(d) Entity Authentication, and 164.312(e)(1) Transmission Security. This definition does not establish HIPAA readiness.
- **Validation and remaining gaps:** Functions type-check, build, and focused tests pass; whitespace and secret-pattern checks pass. Local Bicep compilation is blocked by the laptop proxy CA and will run in GitHub validation before deployment. Azure what-if review, role-assignment authority, resource creation, Key Vault secret entry, reference resolution, alert routing, and live UAT acceptance remain pending. No Azure write occurred.
