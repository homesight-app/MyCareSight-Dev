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
